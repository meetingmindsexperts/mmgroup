import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('MMGroup RAG Chatbot API', () => {
	it('health check returns ok status (unit style)', async () => {
		const request = new IncomingRequest('http://example.com/health');
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		const json = await response.json();
		expect(json).toEqual({ status: 'ok', service: 'mmgroup-chat' });
	});

	it('health check returns ok status (integration style)', async () => {
		const response = await SELF.fetch('https://example.com/health');
		const json = await response.json();
		expect(json).toEqual({ status: 'ok', service: 'mmgroup-chat' });
	});

	it('returns 404 for unknown routes', async () => {
		const request = new IncomingRequest('http://example.com/unknown-route');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(404);
		const json = await response.json();
		expect(json.error).toBe('Not found');
	});

	it('chat endpoint requires POST method', async () => {
		const request = new IncomingRequest('http://example.com/chat', { method: 'GET' });
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(404);
	});

	it('chat endpoint validates message is required', async () => {
		const request = new IncomingRequest('http://example.com/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		const json = await response.json();
		expect(json.error).toBe('Message is required');
	});

	it('chat endpoint validates empty message', async () => {
		const request = new IncomingRequest('http://example.com/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: '   ' }),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		const json = await response.json();
		expect(json.error).toBe('Message cannot be empty');
	});

	it('chat endpoint validates message length', async () => {
		const request = new IncomingRequest('http://example.com/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: 'a'.repeat(2001) }),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		const json = await response.json();
		expect(json.error).toBe('Message too long (max 2000 characters)');
	});

	it('chat endpoint handles invalid JSON', async () => {
		const request = new IncomingRequest('http://example.com/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: 'not valid json',
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(400);
		const json = await response.json();
		expect(json.error).toBe('Invalid JSON in request body');
	});
});
