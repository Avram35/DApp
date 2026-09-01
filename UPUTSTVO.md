# UPUTSTVO — od nule do odbrane projekta

Detaljan vodič za Projektni zadatak 9: DApp za verifikabilne kredencijale i DID sa selektivnim otkrivanjem.

---

## KORAK 0 — Šta ti sve treba (nalozi i softver)

| Šta | Gde | Čemu služi |
|---|---|---|
| Node.js (LTS, v18+) | https://nodejs.org | pokretanje Hardhat-a i React aplikacije |
| Git | https://git-scm.com | verzionisanje koda |
| GitHub nalog | https://github.com | hosting projekta (obavezno po zadatku) |
| MetaMask ekstenzija | https://metamask.io | novčanik za potpisivanje transakcija i poruka |
| Alchemy nalog (besplatan) | https://www.alchemy.com | RPC pristup Sepolia mreži za deploy |
| Google nalog | — | za Sepolia faucet (besplatni test ETH) |
| (Opciono) Etherscan nalog | https://etherscan.io | verifikacija koda ugovora |

---

## KORAK 1 — Instalacija MetaMask-a i kreiranje naloga

1. Otvori https://metamask.io i instaliraj ekstenziju za Chrome/Firefox/Brave.
2. Klikni **Create a new wallet** → smisli lozinku → **zapiši Secret Recovery Phrase na papir** (12 reči). Nikada je ne šalji nikome i ne čuvaj je u fajlu koji ide na GitHub.
3. Za projekat ti trebaju **3 naloga** (tri uloge). U MetaMask-u: klik na ikonicu naloga gore → **Add account** → ponovi dva puta. Preimenuj ih radi preglednosti:
   - `Admin-Issuer` — deploy-uje ugovor (postaje admin) i izdaje kredencijale
   - `Holder` — korisnik koji prima i čuva kredencijal
   - `Verifier` — proverilac
4. Uključi prikaz test mreža: MetaMask → **Settings → Advanced → Show test networks = ON**. Zatim u padajućem meniju mreža izaberi **Sepolia**.

## KORAK 2 — Nabavka test ETH (faucet)

1. Otvori https://cloud.google.com/application/web3/faucet/ethereum/sepolia
2. Prijavi se Google nalogom.
3. Iskopiraj adresu naloga `Admin-Issuer` iz MetaMask-a (klik na adresu = copy) i nalepi je u faucet → **Receive tokens**.
4. Za nekoliko sekundi stiže ~0.05 ETH. Ponovi i za `Holder` i `Verifier` naloge (treba im malo ETH-a za gas — Holder potpisuje samo poruke koje su besplatne, ali Verifier plaća gas za `recordPresentation`).
5. Ako faucet ograniči količinu, ponovi sledećeg dana — deploy + sve transakcije koštaju ukupno < 0.01 ETH.

## KORAK 3 — GitHub repozitorijum

1. Na https://github.com napravi nalog (ako nemaš) → **New repository** → ime npr. `did-vc-dapp`, javan (public), bez inicijalnog README-a.
2. Lokalno, u folderu projekta:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: DID/VC DApp with selective disclosure"
   git branch -M main
   git remote add origin https://github.com/TVOJ_USERNAME/did-vc-dapp.git
   git push -u origin main
   ```
3. **Dodaj profesora na projekat**: repo → **Settings → Collaborators → Add people** → ukucaj `milancabarkapa` → Add.
4. `.gitignore` u projektu već sprečava da `.env` (privatni ključ!) i `node_modules` odu na GitHub — ne menjaj to.

## KORAK 4 — Alchemy (RPC pristup Sepolia mreži)

Hardhat mora nekako da "priča" sa Sepolia mrežom — za to služi RPC provajder.

1. Registruj se na https://www.alchemy.com (besplatno).
2. Dashboard → **Create new app** → Chain: **Ethereum**, Network: **Sepolia**.
3. Otvori aplikaciju → **API key** → iskopiraj **HTTPS URL** (izgleda kao `https://eth-sepolia.g.alchemy.com/v2/AbC123...`).

(Alternativa: https://infura.io — postupak je isti, dobijaš URL oblika `https://sepolia.infura.io/v3/KEY`.)

## KORAK 5 — Podešavanje projekta

```bash
cd did-vc-dapp
npm install          # instalira Hardhat i sve zavisnosti (par minuta)
```

Napravi fajl `.env` po uzoru na `.env.example`:

```
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/TVOJ_KEY
PRIVATE_KEY=0x....
ETHERSCAN_API_KEY=
```

**Privatni ključ** naloga `Admin-Issuer` izvlačiš iz MetaMask-a: klik na tri tačke pored naloga → **Account details → Show private key** → unesi lozinku → copy. 

> ⚠️ Privatni ključ ide ISKLJUČIVO u `.env` koji je u `.gitignore`. Nikada ga ne stavljaj u kod niti na GitHub. Koristi samo test nalog, nikada nalog sa pravim sredstvima.

## KORAK 6 — Kompajliranje i UNIT TESTOVI (4 poena)

```bash
npx hardhat compile     # kompajlira CredentialRegistry.sol
npx hardhat test        # pokreće sva 23 testa
```

Testovi pokrivaju sve što bodovanje traži: kontrolu pristupa (admin/izdavalac), validne i nevalidne scenarije, izdavanje, opoziv, ECDSA potpise, Merkle dokaze za selektivno otkrivanje, falsifikovane dokaze i replay zaštitu. Svi treba da budu zeleni. Uslikaj izlaz — dobro dođe za odbranu.

## KORAK 7 — Deploy na Sepolia mrežu (9 poena)

```bash
npm run deploy:sepolia
```

Izlaz će sadržati nešto poput:

```
CredentialRegistry deployed to: 0xAbCd...1234
```

1. **Iskopiraj tu adresu.**
2. Otvori `frontend/src/contract.js` i zameni vrednost `CONTRACT_ADDRESS` tom adresom.
3. Proveri ugovor na `https://sepolia.etherscan.io/address/0xAbCd...1234` — videćeš deploy transakciju.
4. (Opciono, lep utisak) Verifikuj izvorni kod na Etherscan-u: napravi besplatan API key na https://etherscan.io/myapikey, upiši ga u `.env`, pa:
   ```bash
   npx hardhat verify --network sepolia 0xAbCd...1234
   ```

## KORAK 8 — Pokretanje front-end aplikacije (7 poena)

```bash
cd frontend
npm install
npm run dev
```

Otvori http://localhost:5173 u browseru u kome je MetaMask.

## KORAK 9 — End-to-end test scenario (drugi deo testiranja)

Prođi ceo životni ciklus kredencijala kroz aplikaciju, na Sepolia mreži. Za svaki korak MetaMask će tražiti potvrdu — proveri da je izabran pravi nalog!

**A. Admin registruje izdavaoca** (nalog: `Admin-Issuer`)
1. Klik **Poveži MetaMask** → tab **Admin**.
2. U polje unesi adresu naloga `Admin-Issuer` (u ovom projektu admin je ujedno i izdavalac — može i posebna adresa) → **Registruj izdavaoca** → potvrdi transakciju.
3. Proveri status dugmetom **Proveri** → treba ✔.

**B. Izdavalac izdaje kredencijal** (nalog: `Admin-Issuer`)
1. Tab **Izdavalac**. U polje subject nalepi adresu naloga `Holder`.
2. Popuni atribute, npr: `ime = Petar Petrović`, `datumRodjenja = 2001-05-14`, `punoletan = da`, `fakultet = FIN Kragujevac`.
3. **Potpiši i izdaj kredencijal** → prvo MetaMask traži **potpis poruke** (ECDSA potpis izdavaoca), zatim **transakciju** (upis Merkle root-a na lanac).
4. Klik **Preuzmi credential.json** — taj fajl "predaješ" holderu (u realnosti mejlom/QR-om; ovde ga samo sačuvaj).
5. Zapamti/iskopiraj `credentialId` iz JSON-a (trebaće za opoziv u koraku E).

**C. Holder pravi prezentaciju sa selektivnim otkrivanjem** (prebaci MetaMask na nalog `Holder`!)
1. Tab **Holder** → učitaj `credential.json`.
2. Štikliraj SAMO `punoletan` (datum rođenja ostaje tajan — to je poenta selektivnog otkrivanja).
3. **Potpiši prezentaciju** → MetaMask traži potpis poruke (besplatno, nije transakcija).
4. **Preuzmi presentation.json**.

**D. Proverilac verifikuje** (prebaci MetaMask na nalog `Verifier`)
1. Tab **Proverilac** → učitaj `presentation.json` → **Verifikuj**.
2. Sve provere treba da budu ✔: on-chain status, izdavalac, ECDSA potpis (ugovor ga proverava `ecrecover`-om), Merkle dokaz, potpis holdera, nonce.
3. Klik **Evidentiraj na lancu** → transakcija troši nonce. Klikni **Verifikuj** ponovo → provera nonce-a sada pada ✘ — to je demonstracija replay zaštite.

**E. Opoziv** (nalog: `Admin-Issuer`)
1. Tab **Izdavalac** → u polje za opoziv nalepi `credentialId` → **Opozovi**.
2. Vrati se na **Proverilac** → **Verifikuj** istu prezentaciju (napravi novu preko Holder taba, jer je stari nonce potrošen) → provera on-chain statusa pada ✘. Opozvan kredencijal se odbija.

Uslikaj svaki od ovih koraka (screenshotovi + hash-evi transakcija sa Etherscan-a) — to je dokaz end-to-end provere za 4 poena testiranja.

## KORAK 10 — Završni push na GitHub

```bash
git add .
git commit -m "Deployed to Sepolia + e2e tested"
git push
```

U README na GitHubu možeš dodati adresu deploy-ovanog ugovora i link ka Etherscan-u.

---

## Kako sistem ispunjava zahteve zadatka (za odbranu)

| Zahtev iz zadatka | Gde je implementiran |
|---|---|
| Registar izdavalaca + opoziv kredencijala | `registerIssuer/removeIssuer`, `revokeCredential`, `isCredentialValid` |
| Na lancu samo otisci i metapodaci, bez ličnih podataka | Na lanac ide isključivo `credentialId` (hash UUID-a), `merkleRoot`, adrese i timestamp-ovi |
| ECDSA potpis kredencijala + verifikacija | Izdavalac potpisuje `(credentialId, merkleRoot, subject)` preko MetaMask-a; ugovor proverava `ecrecover`-om u `verifyIssuerSignature` |
| Selektivno otkrivanje kriptografskim mehanizmom | Merkle stablo salt-ovanih atributa; leaf = `keccak256("ključ:vrednost:salt")`; sortirano uparivanje hash-eva; dokaz proverava `verifyAttribute` |
| Zaštita od brute-force pogađanja skrivenih atributa | 128-bitni nasumični salt po atributu |
| Replay zaštita prezentacija | 256-bitni nonce + domen string `"did-vc-dapp-presentation"` u potpisanoj poruci holdera; `recordPresentation` troši nonce na lancu |
| Događaji / revizorski trag | `IssuerRegistered`, `IssuerRemoved`, `CredentialIssued`, `CredentialRevoked`, `PresentationVerified` — svi sa timestamp-om |
| Tri uloge u front-endu | Tabovi Admin / Izdavalac / Holder / Proverilac |
| Unit testovi + e2e | `test/CredentialRegistry.test.js` (26 testova) + scenario iz koraka 9 |

## Česti problemi

- **"insufficient funds for gas"** — nalog nema Sepolia ETH; vrati se na korak 2.
- **MetaMask ne iskače** — proveri da si na `localhost:5173` u browseru gde je ekstenzija instalirana i da nije blokiran popup.
- **"caller is not admin / not an authorized issuer"** — u MetaMask-u je izabran pogrešan nalog; prebaci nalog pa osveži stranicu.
- **Frontend ne vidi ugovor** — zaboravio si da upišeš adresu u `frontend/src/contract.js` ili si na pogrešnoj mreži (mora Sepolia).
- **`npx hardhat test` javlja grešku o verziji Node-a** — instaliraj LTS verziju (v18/v20/v22).
