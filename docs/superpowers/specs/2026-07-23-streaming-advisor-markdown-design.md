# Streaming Advisor Markdown Design

**Date:** 2026-07-23  
**Status:** Approved by the user  
**Scope:** Electron advisor chat only

## Goal

Make ReHoYo's evidence-grounded advisor visibly stream real GLM output and render that output as safe, readable Markdown with Streamdown. The API key must remain in the Electron main process, and generated claims must remain tied to the evidence records selected by the existing local matcher.

## Chosen architecture

The Electron main process owns the GLM `fetch` request and parses its Server-Sent Events response. Each advisor request receives a renderer-generated request ID. The main process publishes request-scoped `start`, `delta`, `complete`, `error`, and `cancelled` events through IPC. The renderer accumulates the full text and passes that snapshot to Streamdown on every delta.

This follows BigModel's documented `stream: true` response shape (`choices[0].delta.content`, followed by `data: [DONE]`) while keeping credentials outside the renderer. Streamdown is designed to accept the full accumulated Markdown string as it changes and to handle incomplete Markdown blocks during streaming.

Alternatives considered:

- Electron `MessagePort`: valid but adds lifecycle and transfer complexity without a clear benefit for short text deltas.
- Renderer-to-provider streaming: rejected because it would expose the API key to renderer JavaScript.
- Polling or simulated typewriter output: rejected because it is not real model streaming.

## Main-process stream

`electron/glm-client.mjs` will expose a streaming request function alongside the current sanitization helpers. It will:

1. Validate the same grounded evidence payload used today.
2. call `/chat/completions` with `stream: true` and an injected `AbortSignal`;
3. validate the HTTP response and readable body;
4. decode UTF-8 incrementally with `TextDecoder` using streaming mode;
5. buffer incomplete SSE lines across network chunks;
6. parse `data:` frames, ignore empty/non-data lines, emit only `delta.content`, and stop on `[DONE]`;
7. return final model/request metadata and reject empty completions.

The parser will be isolated and unit tested for split lines, multiple events per chunk, multibyte CJK boundaries, `[DONE]`, malformed frames, provider errors, and aborts.

## IPC lifecycle

The renderer starts a stream with a sanitized request plus a unique request ID. The main process stores an `AbortController` per sender and request ID, then forwards normalized events without credentials or raw provider payloads.

- `rehoyo:advisor:stream` starts a request and resolves only after the stream closes.
- `rehoyo:advisor:event` carries request-scoped progress events.
- `rehoyo:advisor:cancel` aborts the matching request.

Duplicate request IDs are rejected. Controllers are removed in `finally`; outstanding requests are aborted when their renderer is destroyed. The preload bridge validates listeners and returns an unsubscribe function.

## Advisor UI

Submitting a grounded question immediately appends a user question and an empty live assistant turn. Every matching delta updates that turn's accumulated Markdown. The latest assistant turn stays visible while its content arrives.

Streamdown renders the answer in streaming mode while active and static mode after completion. The app will use safe defaults, will not enable raw HTML, and will limit navigable links to HTTPS. Headings, paragraphs, lists, blockquotes, inline code, fenced code, tables, and links receive compact styles aligned to ReHoYo's flat light interface.

While a response is active:

- the submit button becomes **Stop generating**;
- clicking it aborts the request and preserves all received text;
- suggested questions and the input are disabled to maintain a single active stream;
- an empty response shows a short connecting state instead of a fake answer.

If an error happens before the first delta, the existing locally grounded answer becomes the fallback. If an error happens after content has arrived, the partial model response is preserved and marked incomplete. Citation buttons continue to come from the local evidence matcher, never from Markdown parsing or model-supplied IDs.

## State and cleanup

Only one advisor stream may be active per workspace. A ref stores its request ID so callbacks cannot update a newer turn. Starting a new response is blocked until the current one finishes or is cancelled. Component unmount aborts the request and unsubscribes from IPC events.

## Test strategy

- GLM client unit tests: real SSE framing, incremental decoding, completion metadata, provider errors, malformed data, empty output, and cancellation.
- Preload/bridge tests: stream event subscription, unsubscribe, request start, and cancel channels.
- Advisor component tests: progressive Markdown rendering, final static content, stop-and-preserve behavior, pre-delta fallback, post-delta partial error, and stable evidence citations.
- Existing unit, TypeScript/build, renderer E2E, and Electron E2E suites must remain green.

## Documentation sources

- [BigModel streaming messages](https://docs.bigmodel.cn/cn/guide/capabilities/streaming)
- [BigModel chat completions](https://docs.bigmodel.cn/api-reference/%E6%A8%A1%E5%9E%8B-api/%E5%AF%B9%E8%AF%9D%E8%A1%A5%E5%85%A8)
- [Streamdown usage](https://streamdown.ai/docs/usage)
- [Streamdown security](https://streamdown.ai/docs/security)

