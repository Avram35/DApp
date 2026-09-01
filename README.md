# DApp za verifikabilne kredencijale i decentralizovani identitet (DID) sa selektivnim otkrivanjem

DApp za izdavanje, čuvanje i verifikaciju **Verifiable Credentials (VC)** vezanih za **Decentralized Identity (DID)**, uz **selektivno otkrivanje** atributa (npr. dokaži da si punoletan, bez otkrivanja datuma rođenja).

Projekat iz predmeta Kriptografija - Fakultet inženjerskih nauka, Univerzitet u Kragujevcu.

## Kako radi

- Izdavalac potpisuje kredencijal (ECDSA, MetaMask) i na Sepolia mrežu upisuje samo Merkle koren atributa, nikakvi lični podaci ne idu na lanac.
- Holder bira koje atribute otkriva i šalje prezentaciju sa Merkle dokazima i potpisom.
- Proverilac na lancu proverava: status opoziva, registraciju izdavaoca, ECDSA potpis, Merkle dokaze i nonce (zaštita od replay-a).

## Struktura projekta

```
contracts/   - CredentialRegistry.sol (Solidity ugovor)
scripts/     - deploy skripta za Sepolia
test/        - unit testovi (Hardhat + Chai)
frontend/    - React DApp (Admin / Issuer / Holder / Verifier)
```

## Pokretanje

```bash
npm install
npx hardhat test              # unit testovi

npm run deploy:sepolia        # deploy (prvo popuni .env po uzoru na .env.example)

cd frontend
npm install
npm run dev                   # pokreće frontend na localhost
```


## Tehnologije

Solidity 0.8.24, Hardhat, Ethereum Sepolia, React (Vite), ethers.js v6, MetaMask.
