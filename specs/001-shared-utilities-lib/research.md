# Research: Shared Utilities Library

**Feature**: 001-shared-utilities-lib
**Date**: 2026-04-06

## Research Item 1: MCP SDK Multi-Transport API

**Decision**: Use `@modelcontextprotocol/sdk` with `McpServer` class, attaching transport instances via `server.connect(transport)`. Support stdio via `StdioServerTransport`, HTTP/SSE via `SSEServerTransport` or `StreamableHTTPServerTransport`, and WebSocket via a lightweight custom `ws`-based transport adapter.

**Rationale**:
- The MCP SDK exposes a `McpServer` class that accepts transport objects via `connect()`.
- A single `McpServer` instance can serve multiple transports simultaneously — tools are registered once, accessible from any transport.
- For stdio: `StdioServerTransport` from the SDK handles stdin/stdout natively.
- For SSE/HTTP: The SDK provides HTTP-based transports (`SSEServerTransport` or the newer `StreamableHTTPServerTransport`).
- For WebSocket: The SDK does not ship a built-in WebSocket transport. The project spec requires WebSocket for real-time bid data (`ws` is already a listed dependency). A thin adapter wrapping `ws` that implements the SDK's `Transport` interface will bridge this gap.

**Key API Surface**:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

// Tool registration
server.tool('tool_name', { param: z.string() }, async ({ param }) => ({
  content: [{ type: 'text', text: result }]
}));

// Transport attachment
await server.connect(transport);
```

**Design for `createMcpServer` helper**:
- Accept `McpServerOptions` with `name`, `version`, `transport` (enum: `'stdio' | 'sse' | 'websocket'`), optional `port`/`wsPort`.
- Default transport from `process.env.TRANSPORT` or `'stdio'`.
- Return the configured `McpServer` instance — consumers register their own tools on it.

**Alternatives Considered**:
- Separate server instances per transport: Rejected — duplicates tool registration, higher memory.
- Direct HTTP server without SDK transport: Rejected — breaks MCP protocol compliance.

---

## Research Item 2: Playwright-Extra + Stealth Plugin Compatibility

**Decision**: Use `playwright-extra` (v4.3.6) with `puppeteer-extra-plugin-stealth` for browser fingerprint masking. The combination is functional and widely adopted (476k+ weekly npm downloads).

**Rationale**:
- `playwright-extra` is a drop-in wrapper around `playwright` that adds a plugin system.
- The stealth plugin applies evasion techniques: WebDriver property hiding, headless mode detection prevention, user-agent spoofing, fingerprint masking.
- Despite not being actively maintained (last publish ~2023), it remains the de facto standard for Playwright stealth and is compatible with recent Playwright versions.
- The project spec already lists both packages as dependencies.

**Setup Pattern**:

```typescript
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

const stealth = StealthPlugin();
chromium.use(stealth);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  proxy: process.env.PROXY_URL ? { server: process.env.PROXY_URL } : undefined,
});
```

**Key Considerations**:
- `chromium.use(stealth)` must be called BEFORE `chromium.launch()`.
- The stealth plugin is applied at the browser level; all contexts from that browser inherit stealth.
- This works with Chromium only — the project targets Chromium for all scraping.
- The `BrowserPool` should call `chromium.use(stealth)` once during initialization, not per-context.

**Alternatives Considered**:
- Manual stealth via Playwright context options: Rejected — incomplete evasion coverage, high maintenance burden.
- Puppeteer instead of Playwright: Rejected — Playwright is the project standard and supports multi-browser.

---

## Research Item 3: NHTSA vPIC API Response Schema

**Decision**: Use the `DecodeVinValues` endpoint (`/api/vehicles/DecodeVinValues/{vin}?format=json`) which returns a flat key-value object rather than the nested `DecodeVin` array. This simplifies parsing.

**Rationale**:
- The flat `DecodeVinValues` response returns a single object with camelCase keys (e.g., `Make`, `Model`, `ModelYear`) — no need to search through an array of variable/value pairs.
- The endpoint is free, requires no authentication, and has no documented rate limit (though we enforce our own via the priority queue).
- Invalid VINs return HTTP 200 with error codes in the `ErrorCode` field (not HTTP error codes).

**Endpoint**: `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}?format=json`

**Response Schema (relevant fields)**:

```json
{
  "Count": 1,
  "Message": "Results returned successfully...",
  "SearchCriteria": "VIN(s): 1HGCM82633A004352",
  "Results": [{
    "Make": "HONDA",
    "MakeID": "474",
    "Model": "Accord",
    "ModelID": "1861",
    "ModelYear": "2003",
    "Trim": "EX",
    "BodyClass": "Sedan/Saloon",
    "DriveType": "Front-Wheel Drive",
    "FuelTypePrimary": "Gasoline",
    "TransmissionStyle": "Automatic",
    "TransmissionSpeeds": "5",
    "EngineCylinders": "4",
    "DisplacementL": "2.4",
    "EngineModel": "K24A4",
    "VehicleType": "PASSENGER CAR",
    "PlantCountry": "UNITED STATES (USA)",
    "ErrorCode": "0",
    "ErrorText": "0 - VIN decoded clean. Check Digit (9th position) is correct"
  }]
}
```

**Field Mapping to `VINDecodeResult`**:

| VINDecodeResult field | vPIC Response Key | Notes |
|---|---|---|
| `year` | `ModelYear` | Parse to number |
| `make` | `Make` | Title case in response |
| `model` | `Model` | As-is |
| `trim` | `Trim` | May be empty string |
| `engineType` | `EngineModel` | May be empty; fallback to `EngineCylinders` + `DisplacementL` |
| `bodyClass` | `BodyClass` | e.g., "Sedan/Saloon", "SUV" |
| `driveType` | `DriveType` | e.g., "Front-Wheel Drive" |
| `fuelType` | `FuelTypePrimary` | e.g., "Gasoline", "Diesel" |
| `transmission` | `TransmissionStyle` | e.g., "Automatic", "Manual" |

**Error Handling**:
- `ErrorCode: "0"` = clean decode
- `ErrorCode: "1"` = check digit incorrect
- `ErrorCode: "5"` = VIN has errors in some positions
- `ErrorCode: "6"` = incomplete VIN
- `ErrorCode: "14"` = unable to determine data for some fields
- Multiple error codes can appear comma-separated (e.g., `"5,6,14"`)
- API always returns HTTP 200 — errors are in the response body, not HTTP status.

**Invalid VIN Handling**: Our `validateVin` function rejects bad VINs before any API call. For edge cases where the API returns errors, we check `ErrorCode` and map appropriately.

**Alternatives Considered**:
- `DecodeVin` (nested array format): Rejected — requires iterating `Results` array to find each variable by name. More code, same data.
- `DecodeVinExtended`: Rejected — returns extra fields we don't need, larger response payload.
- Third-party VIN APIs: Rejected — NHTSA is free and sufficient for year/make/model/specs.
