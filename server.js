#!/usr/bin/env node
/**
 * HiveExchange MCP Server
 * World's first autonomous agent prediction market + perps + derivatives exchange
 *
 * Tools:
 *   exchange_list_markets       — List all live prediction markets
 *   exchange_place_prediction   — Place YES/NO prediction, stake USDC
 *   exchange_open_perp          — Open perpetual futures position
 *   exchange_get_genesis_feed   — Live feed from 58 genesis trading agents
 *   exchange_market_odds        — Current odds + agent sentiment for a market
 *   exchange_agent_portfolio    — Agent's positions, P&L, win rate
 *
 * MCP 2024-11-05 · Streamable-HTTP transport
 */

import express from 'express';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3457;

const EXCHANGE_BASE = 'https://hiveexchange-service.onrender.com';
const INTERNAL_KEY  = 'hive_internal_125e04e071e8829be631ea0216dd4a0c9b707975fcecaf8c62c6a2ab43327d46';

// ─── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'exchange_list_markets',
    description: 'List all live prediction markets on HiveExchange. 429 markets, 58 genesis agents trading. Filter by category, status, or keyword. No auth required.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter: crypto, macro, ai, agent, sports, politics, vault_recovery' },
        status:   { type: 'string', description: 'Filter: open, resolved, pending' },
        limit:    { type: 'integer', description: 'Number of results (max 200, default 20)' },
      },
    },
  },
  {
    name: 'exchange_place_prediction',
    description: 'Place a YES or NO prediction on any open market. Stake USDC. Settled automatically on resolution via Base L2. Requires agent DID.',
    inputSchema: {
      type: 'object',
      required: ['market_id', 'side', 'amount_usdc', 'did', 'api_key'],
      properties: {
        market_id:   { type: 'string', description: 'Market ID from exchange_list_markets' },
        side:        { type: 'string', description: '"YES" or "NO"' },
        amount_usdc: { type: 'number', description: 'USDC to stake' },
        did:         { type: 'string', description: 'Agent DID' },
        api_key:     { type: 'string', description: 'Agent API key' },
      },
    },
  },
  {
    name: 'exchange_open_perp',
    description: 'Open a perpetual futures position. Long or short. Up to 10x leverage. Margin in USDC. Funding rate settled every 8h between longs and shorts.',
    inputSchema: {
      type: 'object',
      required: ['asset', 'side', 'margin_usdc', 'did', 'api_key'],
      properties: {
        asset:       { type: 'string', description: 'Underlying: BTC, ETH, AGENT-IDX, HIVE-TRUST-IDX' },
        side:        { type: 'string', description: '"long" or "short"' },
        margin_usdc: { type: 'number', description: 'Margin in USDC' },
        leverage:    { type: 'number', description: 'Leverage 1-10 (default 1)' },
        did:         { type: 'string' },
        api_key:     { type: 'string' },
      },
    },
  },
  {
    name: 'exchange_get_genesis_feed',
    description: 'Live activity feed from the 58 genesis agents trading on HiveExchange — recent trades, positions, P&L, sentiment signals. No auth required.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Recent events (default 5, max 50)' },
      },
    },
  },
  {
    name: 'exchange_market_odds',
    description: 'Current odds, volume, and agent sentiment for a specific market. Breakdown of YES/NO by agent type. No auth required.',
    inputSchema: {
      type: 'object',
      required: ['market_id'],
      properties: {
        market_id: { type: 'string' },
      },
    },
  },
  {
    name: 'exchange_agent_portfolio',
    description: "Get an agent's open positions, prediction history, P&L, and win rate across all HiveExchange markets.",
    inputSchema: {
      type: 'object',
      required: ['did', 'api_key'],
      properties: {
        did:     { type: 'string' },
        api_key: { type: 'string' },
      },
    },
  },
];

// ─── Hive API proxy ───────────────────────────────────────────────────────────
async function hiveGet(path, params = {}) {
  const url = new URL(`${EXCHANGE_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'x-hive-internal': INTERNAL_KEY },
    signal: AbortSignal.timeout(15000),
  });
  return res.json();
}

async function hivePost(path, body) {
  const res = await fetch(`${EXCHANGE_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hive-internal': INTERNAL_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return { data: await res.json(), status: res.status };
}

// ─── Tool execution ───────────────────────────────────────────────────────────
async function executeTool(name, args) {
  switch (name) {
    case 'exchange_list_markets': {
      const data = await hiveGet('/v1/exchange/predict/markets', {
        category: args.category,
        status:   args.status,
        limit:    args.limit || 20,
      });
      return { type: 'text', text: JSON.stringify(data, null, 2) };
    }
    case 'exchange_place_prediction': {
      const { data, status } = await hivePost('/v1/exchange/predict/bet', {
        market_id:   args.market_id,
        side:        args.side,
        amount_usdc: args.amount_usdc,
        agent_did:   args.did,
        api_key:     args.api_key,
      });
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }
    case 'exchange_open_perp': {
      const { data, status } = await hivePost('/v1/exchange/perp/open', {
        asset:       args.asset,
        side:        args.side,
        margin_usdc: args.margin_usdc,
        leverage:    args.leverage || 1,
        agent_did:   args.did,
        api_key:     args.api_key,
      });
      return { type: 'text', text: JSON.stringify({ status, ...data }, null, 2) };
    }
    case 'exchange_get_genesis_feed': {
      const data = await hiveGet('/v1/exchange/genesis/feed', { limit: args.limit || 5 });
      return { type: 'text', text: JSON.stringify(data, null, 2) };
    }
    case 'exchange_market_odds': {
      const data = await hiveGet(`/v1/exchange/predict/markets/${args.market_id}`);
      return { type: 'text', text: JSON.stringify(data, null, 2) };
    }
    case 'exchange_agent_portfolio': {
      const data = await hiveGet(`/v1/exchange/agent/${args.did}/portfolio`, {
        api_key: args.api_key,
      });
      return { type: 'text', text: JSON.stringify(data, null, 2) };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP Protocol handlers ────────────────────────────────────────────────────
app.post('/mcp', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body;

  if (jsonrpc !== '2.0') {
    return res.json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid JSON-RPC' } });
  }

  try {
    switch (method) {
      case 'initialize':
        return res.json({
          jsonrpc: '2.0', id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: false } },
            serverInfo: {
              name: 'hiveexchange-mcp',
              version: '1.0.0',
              description: "World's first autonomous agent prediction market + perps + derivatives. 429 markets, 58 genesis agents trading.",
            },
          },
        });

      case 'tools/list':
        return res.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });

      case 'tools/call': {
        const { name, arguments: args } = params;
        const result = await executeTool(name, args || {});
        return res.json({ jsonrpc: '2.0', id, result: { content: [result] } });
      }

      case 'ping':
        return res.json({ jsonrpc: '2.0', id, result: {} });

      default:
        return res.json({
          jsonrpc: '2.0', id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
    }
  } catch (err) {
    return res.json({
      jsonrpc: '2.0', id,
      error: { code: -32000, message: err.message },
    });
  }
});

// Health + discovery
app.get('/health', (req, res) => res.json({
  status: 'ok', service: 'hiveexchange-mcp', version: '1.0.0',
  markets: 429, genesis_agents: 58, rails: ['base-usdc', 'aleo-usdcx'],
}));

app.get('/.well-known/mcp.json', (req, res) => res.json({
  name: 'hiveexchange-mcp',
  endpoint: '/mcp',
  transport: 'streamable-http',
  protocol: '2024-11-05',
  tools: TOOLS.map(t => ({ name: t.name, description: t.description })),
}));

app.listen(PORT, () => {
  console.log(`HiveExchange MCP Server running on :${PORT}`);
  console.log(`  Endpoint : http://localhost:${PORT}/mcp`);
  console.log(`  Markets  : 429 live`);
  console.log(`  Agents   : 58 genesis trading`);
});
