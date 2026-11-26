const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, writeFile, chmod, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { mountCodexRoutes, translateCodex } = require('../codex-cli.cjs');
const { createJobs } = require('../jobs.cjs');
const { readFileSync } = require('node:fs');

test('browser CLI bypasses missing profiles and forwards selected configuration', async () => {
    const source = readFileSync(join(__dirname, '../../index.js'), 'utf8');
    const requestSource = source.slice(source.indexOf('async function sendProfileRequest('), source.indexOf('function fallbackEligibleError('));
    let calls = 0;
    const env = {
        settings: { codexCliEnabled: true, codexCliModel: 'gpt-test', codexCliReasoning: 'high', profileId: '', debugMode: false },
        profileList() { throw Error('CLI must not look up profiles'); },
        createSecondTranslationAttempt: () => null, performance, AbortController,
        outputTiming: { enqueue() {}, sent() {}, received() {}, settled() {} },
        liveContext() { throw Error('CLI must not request connection-manager transport'); },
        enqueueRequest: fn => fn(), extractResponseText: response => response.content,
        abortError: () => new DOMException('cancelled', 'AbortError'),
        async sendCodexRequest(prompt, options) {
            calls++;
            assert.equal(prompt, 'literal translation prompt');
            assert.equal(options.model, 'gpt-test');
            assert.equal(options.reasoning, 'high');
            assert.equal(options.signal.aborted, false);
            return { content: '번역' };
        },
    };
    const send = Function(...Object.keys(env), requestSource + '\nreturn sendProfileRequest;')(...Object.values(env));
    assert.deepEqual(await send('literal translation prompt'), { content: '번역' });
    assert.equal(calls, 1);
});

for (const variant of ['verba', 'verba-deep']) test(`${variant}: rebuilt engine uses CLI even with saved Google engine and no profile`, async () => {
    const { createEngine } = await import(`../engines/${variant}.mjs`);
    let calls = 0;
    const engine = createEngine({ settings: { codexCliEnabled: true, translationEngine: 'google-free' }, profiles: {}, context: {} },
        async (_id, messages, _tokens, options) => {
            calls++;
            assert.equal(messages[0].content, 'Translate this literal prompt');
            assert.ok(options.signal instanceof AbortSignal);
            return { content: '번역' };
        });
    assert.deepEqual(await engine.request('Translate this literal prompt'), { content: '번역' });
    assert.equal(calls, 1);
});

test('CLI process forwards literal stdin, model and reasoning, and supports cancellation', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'verba-cli-test-'));
    const executable = join(directory, 'codex');
    const previous = process.env.VERBA_CODEX_EXECUTABLE;
    await writeFile(executable, `#!/usr/bin/env node
const readline = require('node:readline');
const args = process.argv.slice(2);
if (args.includes('app-server')) {
  readline.createInterface({ input: process.stdin }).on('line', line => {
    const request = JSON.parse(line);
    if (request.id === 1) console.log(JSON.stringify({ id: 1, result: {} }));
    if (request.id === 2) console.log(JSON.stringify({ id: 2, result: {
      data: [{ model: 'gpt-test', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'high' }] }, { model: 'hidden', hidden: true }], nextCursor: null
    } }));
  });
} else {
  let prompt = '';
  process.stdin.on('data', chunk => { prompt += chunk; });
  process.stdin.on('end', () => {
    if (prompt === 'WAIT') setInterval(() => {}, 1000);
    else console.log(JSON.stringify({ prompt, args }));
  });
}
`);
    await chmod(executable, 0o755);
    process.env.VERBA_CODEX_EXECUTABLE = executable;
    try {
        await t.test('literal input and CLI flags', async () => {
            const prompt = 'Translate $(do_not_execute) `literal` <b>안녕</b>\nSecond line';
            const result = await translateCodex(prompt, { model: 'gpt-test', reasoning: 'high' });
            const value = JSON.parse(result.content);
            assert.equal(value.prompt, prompt);
            assert.equal(value.args[value.args.indexOf('--model') + 1], 'gpt-test');
            assert.ok(value.args.includes('model_reasoning_effort="high"'));
            assert.ok(value.args.includes('read-only'));
            assert.ok(value.args.includes('--ignore-user-config'));
            assert.ok(value.args.includes('shell_tool'));
        });
        await t.test('model catalog through authenticated route', async () => {
            const routes = {};
            let owners = 0;
            mountCodexRoutes({ get: (path, fn) => { routes[path] = fn; }, post() {} },
                () => { owners++; }, handler => handler);
            const result = await routes['/codex/models']({}, { once() {} });
            assert.equal(owners, 1);
            assert.deepEqual(result.models, [{ id: 'gpt-test', isDefault: true, efforts: ['high'] }]);
        });
        await t.test('cancel stops an in-flight process', async () => {
            const controller = new AbortController();
            const pending = translateCodex('WAIT', {}, { signal: controller.signal });
            setTimeout(() => controller.abort(), 100);
            await assert.rejects(pending, { name: 'AbortError' });
        });
        await t.test('invalid model and reasoning are rejected', async () => {
            await assert.rejects(translateCodex('Hello', { model: '--unsafe' }), error => error.status === 400);
            await assert.rejects(translateCodex('Hello', { reasoning: 'high; command' }), error => error.status === 400);
        });
    } finally {
        if (previous === undefined) delete process.env.VERBA_CODEX_EXECUTABLE;
        else process.env.VERBA_CODEX_EXECUTABLE = previous;
        await rm(directory, { recursive: true, force: true });
    }
});

for (const variant of ['verba', 'verba-deep']) for (const enabled of [true, false]) test(`${variant}: server job routes CLI=${enabled} without changing profile transport`, async () => {
    let cliCalls = 0, profileCalls = 0;
    const controllerSignals = [];
    const jobs = createJobs({
        engines: { [variant]: { createEngine: (_snapshot, transport) => ({
            request: (prompt, options) => transport('A', [{ role: 'user', content: prompt }], 32000, options),
        }) } },
        codexRequest: async (prompt, config, options) => {
            cliCalls++;
            assert.equal(prompt, 'Translate this');
            assert.deepEqual(config, { model: 'gpt-test', reasoning: 'high' });
            controllerSignals.push(options.signal);
            return { content: '번역' };
        },
        profileRequest: async (_connection, _profiles, id, _messages, tokens) => {
            profileCalls++; assert.equal(id, 'A'); assert.equal(tokens, 32000);
            return { content: '번역' };
        },
    });
    const job = jobs.start('owner', { id: 'a'.repeat(32), kind: 'request', source: 'Translate this',
        snapshot: { variant, settings: { codexCliEnabled: enabled, codexCliModel: 'gpt-test', codexCliReasoning: 'high' }, profiles: {} },
    }, {});
    await job.done;
    assert.equal(job.state, 'completed');
    assert.equal(cliCalls, enabled ? 1 : 0);
    assert.equal(profileCalls, enabled ? 0 : 1);
    if (enabled) assert.equal(controllerSignals[0], job.controller.signal);
});

test('shared server runs both released CLI engines with independent model settings', async () => {
    const variants = ['verba', 'verba-deep'];
    const engines = {};
    for (const variant of variants) engines[variant] = await import(`../engines/${variant}.mjs`);
    const { engines: versions } = require('../engines/manifest.json');
    const observed = [];
    const jobs = createJobs({ engines, versions,
        async codexRequest(prompt, config) {
            observed.push([prompt, config.model, config.reasoning]);
            return { content: `translated:${prompt}` };
        },
        profileRequest() { throw Error('CLI jobs must not capture or call a profile'); },
    });
    const active = variants.map((variant, index) => jobs.start('owner', {
        id: String(index + 1).repeat(32), kind: 'request', source: variant,
        snapshot: { variant, version: versions[variant].version,
            settings: { codexCliEnabled: true, codexCliModel: `gpt-test-${index}`, codexCliReasoning: index ? 'high' : 'low' }, profiles: {}, context: {} },
    }, {}));
    await Promise.all(active.map(job => job.done));
    assert.deepEqual(active.map(job => job.state), ['completed', 'completed']);
    assert.deepEqual(active.map(job => job.result.content), variants.map(variant => `translated:${variant}`));
    assert.deepEqual(observed.sort(), [['verba', 'gpt-test-0', 'low'], ['verba-deep', 'gpt-test-1', 'high']]);
});
