# Referral Analytics Dashboard

A decision-first, browser-only referral analytics dashboard. Import `Clientes.csv` and `txs-start-to-end.ndjson` to rank referral codes by revenue, quality, conversion, and KYC without a backend.

## How to run

```bash
npm install
npm run dev
```

Open the local Vite URL in your browser and use the Import screen to upload the two required files.

## Supported file formats

### Clientes.csv
Required columns:
- `ID`
- `E-mail`
- `EOA`
- `Smart Wallet`
- `Cadastrado em`
- `Provedor de acesso`
- `Referral`

Optional columns:
- `Notus Individual ID` (non-empty means KYC)

### txs-start-to-end.ndjson
One JSON object per line. Only `SWAP` and `CROSS_SWAP` are counted as revenue transactions.

Required fields for revenue attribution:
- `type`
- `createdAt`
- `sentBy`
- `collectedFee.amountIn.usd`
- `receivedAmount.amountIn.usd` or `sentAmount.amountIn.usd`

Optional fields:
- `transactionHash.hash` or `mainUserOpHash`

## Limits & performance tips

- NDJSON files are streamed with `file.stream()` + `TextDecoder` to avoid loading all transactions at once.
- Only a minimal transaction subset is stored for drilldowns (last 500 revenue txs per referral by default).
- Toggle **Keep full tx list** if you need every revenue transaction stored in-memory.
- Analytics metrics are pre-aggregated during parsing for fast date range filtering.

## Caching behavior

Parsed data is cached in IndexedDB using a key based on file name, size, and last modified date. Re-uploading the exact same files loads the snapshot immediately without reparsing.

You can also export a shareable snapshot JSON from the Decision Board to reuse the analytics index later.
