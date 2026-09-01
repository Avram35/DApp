import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI, SEPOLIA_CHAIN_ID } from "./contract.js";
import {
  leafHash,
  buildMerkleTree,
  getMerkleProof,
  verifyProofLocally,
  randomSalt,
} from "./merkle.js";

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export default function App() {
  const [account, setAccount] = useState(null);
  const [chainOk, setChainOk] = useState(true);
  const [tab, setTab] = useState("issuer");
  const [log, setLog] = useState([]);

  const addLog = useCallback((type, msg) => {
    setLog((l) => [{ type, msg, t: new Date().toLocaleTimeString() }, ...l].slice(0, 30));
  }, []);

  // ------------------------------------------------------------------ wallet
  async function connect() {
    if (!window.ethereum) {
      addLog("err", "MetaMask is not installed. Install the extension then refresh the page.");
      return;
    }
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    setAccount(ethers.getAddress(accounts[0]));
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    setChainOk(chainId === SEPOLIA_CHAIN_ID);
    addLog("ok", `Connected account ${short(accounts[0])}`);
  }

  async function switchToSepolia() {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID }],
    });
  }

  useEffect(() => {
    if (!window.ethereum) return;
    const onAccounts = (a) => setAccount(a.length ? ethers.getAddress(a[0]) : null);
    const onChain = (c) => setChainOk(c === SEPOLIA_CHAIN_ID);
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccounts);
      window.ethereum.removeListener("chainChanged", onChain);
    };
  }, []);

  async function getContract(withSigner = true) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    if (!withSigner) return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    const signer = await provider.getSigner();
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div>
            <h1>DID Wallet</h1>
            <p>Verifiable credentials · selective disclosure · Sepolia</p>
          </div>
        </div>
        <div className="wallet">
          {!chainOk && account && (
            <button onClick={switchToSepolia}>Switch to Sepolia</button>
          )}
          {account ? (
            <span className="mono">{short(account)}</span>
          ) : (
            <button onClick={connect}>Connect MetaMask</button>
          )}
        </div>
      </header>

      <nav className="tabs">
        {[
          ["admin", "Admin"],
          ["issuer", "Issuer"],
          ["holder", "Holder"],
          ["verifier", "Verifier"],
        ].map(([id, label]) => (
          <button key={id} className={tab === id ? "tab active" : "tab"} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <main>
        {tab === "admin" && <AdminPanel getContract={getContract} addLog={addLog} />}
        {tab === "issuer" && <IssuerPanel getContract={getContract} addLog={addLog} account={account} />}
        {tab === "holder" && <HolderPanel addLog={addLog} account={account} />}
        {tab === "verifier" && <VerifierPanel getContract={getContract} addLog={addLog} />}
      </main>

      <section className="logbox">
        <h3>Activity log</h3>
        {log.length === 0 && <p className="muted">No activity yet. Connect your wallet and pick a role.</p>}
        {log.map((l, i) => (
          <div key={i} className={`logline ${l.type}`}>
            <span className="mono muted">{l.t}</span> {l.msg}
          </div>
        ))}
      </section>
    </div>
  );
}

/* ========================================================================== */
/* ADMIN — registar izdavalaca                                                */
/* ========================================================================== */
function AdminPanel({ getContract, addLog }) {
  const [issuerAddr, setIssuerAddr] = useState("");
  const [checkAddr, setCheckAddr] = useState("");
  const [checkResult, setCheckResult] = useState(null);

  async function register() {
    try {
      const c = await getContract();
      const tx = await c.registerIssuer(issuerAddr.trim());
      addLog("info", `Transaction sent: ${tx.hash}`);
      await tx.wait();
      addLog("ok", `Issuer ${short(issuerAddr)} registered.`);
    } catch (e) {
      addLog("err", e.reason || e.shortMessage || e.message);
    }
  }

  async function remove() {
    try {
      const c = await getContract();
      const tx = await c.removeIssuer(issuerAddr.trim());
      await tx.wait();
      addLog("ok", `Issuer ${short(issuerAddr)} removed.`);
    } catch (e) {
      addLog("err", e.reason || e.shortMessage || e.message);
    }
  }

  async function check() {
    try {
      const c = await getContract(false);
      const ok = await c.authorizedIssuers(checkAddr.trim());
      setCheckResult(ok);
    } catch (e) {
      addLog("err", e.reason || e.shortMessage || e.message);
    }
  }

  return (
    <div className="panel">
      <h2>Issuer registry</h2>
      <label>Issuer address</label>
      <input className="mono" value={issuerAddr} onChange={(e) => setIssuerAddr(e.target.value)} placeholder="0x…" />
      <div className="row">
        <button onClick={register}>Register issuer</button>
        <button onClick={remove}>Remove issuer</button>
      </div>

      <hr />
      <label>Check issuer status</label>
      <div className="row">
        <input className="mono grow" value={checkAddr} onChange={(e) => setCheckAddr(e.target.value)} placeholder="0x…" />
        <button onClick={check}>Check</button>
      </div>
      {checkResult !== null && (
        <p className={checkResult ? "ok-text" : "err-text"}>
          {checkResult ? "✔ Address is an authorized issuer" : "✘ Address is not an authorized issuer"}
        </p>
      )}
    </div>
  );
}

/* ========================================================================== */
/* IZDAVALAC — kreira, potpisuje i registruje kredencijal                     */
/* ========================================================================== */
function IssuerPanel({ getContract, addLog, account }) {
  const [subject, setSubject] = useState("");
  const [attrs, setAttrs] = useState([
    { key: "name", value: "" },
    { key: "dateOfBirth", value: "" },
    { key: "isAdult", value: "yes" },
    { key: "university", value: "" },
  ]);
  const [credentialJson, setCredentialJson] = useState(null);
  const [revokeId, setRevokeId] = useState("");

  function setAttr(i, field, val) {
    setAttrs((a) => a.map((x, j) => (j === i ? { ...x, [field]: val } : x)));
  }

  async function issue() {
    try {
      if (!ethers.isAddress(subject.trim())) throw new Error("Invalid holder address (subject)");
      const filled = attrs.filter((a) => a.key.trim() && a.value.trim());
      if (filled.length === 0) throw new Error("Enter at least one attribute");

      // 1) salt za svaki atribut (dovoljna entropija -> sprečava brute-force listova)
      const salted = filled.map((a) => ({ ...a, salt: randomSalt() }));

      // 2) Merkle stablo atributa
      const leaves = salted.map((a) => leafHash(a.key, a.value, a.salt));
      const tree = buildMerkleTree(leaves);

      // 3) jedinstveni credentialId (hash UUID-a — nikakav lični podatak)
      const credentialId = ethers.keccak256(ethers.toUtf8Bytes(crypto.randomUUID()));

      // 4) ECDSA potpis izdavaoca nad (credentialId, merkleRoot, subject) preko MetaMask-a
      const messageHash = ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32", "address"],
        [credentialId, tree.root, subject.trim()]
      );
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const issuerSignature = await signer.signMessage(ethers.getBytes(messageHash));
      addLog("info", "Credential signed (ECDSA / MetaMask).");

      // 5) upis otiska na lanac
      const c = await getContract();
      const tx = await c.issueCredential(credentialId, subject.trim(), tree.root);
      addLog("info", `Transaction sent: ${tx.hash}`);
      await tx.wait();
      addLog("ok", "Credential registered on the Sepolia network (Merkle root only, no personal data).");

      // 6) kompletan kredencijal (sa podacima i salt-ovima) ide HOLDERU, ne na lanac
      const credential = {
        type: "VerifiableCredential",
        credentialId,
        issuer: account,
        subject: subject.trim(),
        merkleRoot: tree.root,
        issuerSignature,
        attributes: salted,
        issuedAt: new Date().toISOString(),
      };
      setCredentialJson(JSON.stringify(credential, null, 2));
    } catch (e) {
      addLog("err", e.reason || e.shortMessage || e.message);
    }
  }

  function download() {
    const blob = new Blob([credentialJson], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "credential.json";
    a.click();
  }

  async function revoke() {
    try {
      const c = await getContract();
      const tx = await c.revokeCredential(revokeId.trim());
      await tx.wait();
      addLog("ok", "Credential revoked.");
    } catch (e) {
      addLog("err", e.reason || e.shortMessage || e.message);
    }
  }

  return (
    <div className="panel">
      <h2>Issue credential</h2>

      <label>Holder address (subject / DID)</label>
      <input className="mono" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="0x…" />

      <label>Attributes</label>
      {attrs.map((a, i) => (
        <div className="row" key={i}>
          <input className="grow" value={a.key} onChange={(e) => setAttr(i, "key", e.target.value)} placeholder="key (e.g. name)" />
          <input className="grow" value={a.value} onChange={(e) => setAttr(i, "value", e.target.value)} placeholder="value" />
          <button onClick={() => setAttrs((x) => x.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button onClick={() => setAttrs((a) => [...a, { key: "", value: "" }])}>
        + Add attribute
      </button>

      <div className="row" style={{ marginTop: 16 }}>
        <button onClick={issue}>Sign and issue credential</button>
      </div>

      {credentialJson && (
        <>
          <label>Credential (hand to holder — NOT going on the blockchain!)</label>
          <textarea className="mono" rows={10} readOnly value={credentialJson} />
          <button onClick={download}>Download credential.json</button>
        </>
      )}

      <hr />
      <h3>Revoke credential</h3>
      <div className="row">
        <input className="mono grow" value={revokeId} onChange={(e) => setRevokeId(e.target.value)} placeholder="credentialId (0x…)" />
        <button onClick={revoke}>Revoke</button>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* HOLDER — čuva kredencijal, pravi prezentaciju sa selektivnim otkrivanjem   */
/* ========================================================================== */
function HolderPanel({ addLog, account }) {
  const [credential, setCredential] = useState(null);
  const [selected, setSelected] = useState({});
  const [presentationJson, setPresentationJson] = useState(null);

  function loadFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const c = JSON.parse(reader.result);
        setCredential(c);
        setSelected({});
        setPresentationJson(null);
        addLog("ok", `Loaded credential ${short(c.credentialId)} (${c.attributes.length} attributes).`);
      } catch {
        addLog("err", "File is not a valid JSON credential.");
      }
    };
    reader.readAsText(f);
  }

  async function makePresentation() {
    try {
      const chosen = credential.attributes
        .map((a, i) => ({ ...a, i }))
        .filter((a) => selected[a.i]);
      if (chosen.length === 0) throw new Error("Select at least one attribute to disclose");

      // Rekonstrukcija stabla iz SVIH atributa, dokaz samo za izabrane
      const leaves = credential.attributes.map((a) => leafHash(a.key, a.value, a.salt));
      const tree = buildMerkleTree(leaves);
      if (tree.root !== credential.merkleRoot) throw new Error("Merkle root does not match — the credential has been tampered with!");

      const disclosed = chosen.map((a) => ({
        key: a.key,
        value: a.value,
        salt: a.salt,
        proof: getMerkleProof(tree.layers, a.i),
      }));

      // Nonce (challenge) — zaštita od replay napada, ulazi u potpis holdera
      const nonce = ethers.hexlify(ethers.randomBytes(32));
      const holderMsgHash = ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32", "string"],
        [credential.credentialId, nonce, "did-vc-dapp-presentation"]
      );
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const holderSignature = await signer.signMessage(ethers.getBytes(holderMsgHash));

      const presentation = {
        type: "VerifiablePresentation",
        credentialId: credential.credentialId,
        issuer: credential.issuer,
        subject: credential.subject,
        issuerSignature: credential.issuerSignature,
        nonce,
        holderSignature,
        disclosed,
        createdAt: new Date().toISOString(),
      };
      setPresentationJson(JSON.stringify(presentation, null, 2));
      addLog("ok", `Presentation created: disclosed ${disclosed.length}, hidden ${credential.attributes.length - disclosed.length} attributes.`);
    } catch (e) {
      addLog("err", e.reason || e.shortMessage || e.message);
    }
  }

  function download() {
    const blob = new Blob([presentationJson], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "presentation.json";
    a.click();
  }

  return (
    <div className="panel">
      <h2>My credential</h2>
      <input type="file" accept=".json" onChange={loadFile} />

      {credential && (
        <>
          <div className="idcard">
            <div className="idcard-head">
              <span>VERIFIABLE CREDENTIAL</span>
              <span className="mono">{short(credential.credentialId)}</span>
            </div>
            <div className="idcard-row"><span>Issuer</span><span className="mono">{short(credential.issuer)}</span></div>
            <div className="idcard-row"><span>Subject (me)</span><span className="mono">{short(credential.subject)}</span></div>
            {account && account.toLowerCase() !== credential.subject.toLowerCase() && (
              <p className="err-text">Warning: the connected account is not the subject of this credential.</p>
            )}
          </div>

          <label>Select which attributes to disclose (the rest stay hidden)</label>
          {credential.attributes.map((a, i) => (
            <label className="checkrow" key={i}>
              <input
                type="checkbox"
                checked={!!selected[i]}
                onChange={(e) => setSelected((s) => ({ ...s, [i]: e.target.checked }))}
              />
              <span><b>{a.key}</b>: {a.value}</span>
            </label>
          ))}

          <div className="row" style={{ marginTop: 16 }}>
            <button onClick={makePresentation}>Sign presentation</button>
          </div>
        </>
      )}

      {presentationJson && (
        <>
          <label>Presentation (hand to verifier)</label>
          <textarea className="mono" rows={10} readOnly value={presentationJson} />
          <button onClick={download}>Download presentation.json</button>
        </>
      )}
    </div>
  );
}

/* ========================================================================== */
/* PROVERILAC — verifikuje prezentaciju                                       */
/* ========================================================================== */
function VerifierPanel({ getContract, addLog }) {
  const [input, setInput] = useState("");
  const [results, setResults] = useState(null);

  function loadFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setInput(reader.result);
    reader.readAsText(f);
  }

  async function verify() {
    try {
      const p = JSON.parse(input);
      const checks = [];
      const c = await getContract(false);

      // 1) On-chain status: izdat? neopozvan? izdavalac ovlašćen?
      const onChain = await c.getCredential(p.credentialId);
      const valid = await c.isCredentialValid(p.credentialId);
      checks.push({ name: "Credential exists, not revoked, issuer authorized (on-chain)", ok: valid });
      checks.push({
        name: `On-chain issuer (${short(onChain.issuer)}) = issuer in presentation`,
        ok: onChain.issuer.toLowerCase() === p.issuer.toLowerCase(),
      });

      // 2) ECDSA potpis izdavaoca — proverava sam ugovor
      const sigOk = await c.verifyIssuerSignature(p.credentialId, p.issuerSignature);
      checks.push({ name: "Issuer's ECDSA signature valid (on-chain ecrecover)", ok: sigOk });

      // 3) Merkle dokazi za svaki otkriveni atribut — on-chain + lokalno
      for (const d of p.disclosed) {
        const leaf = leafHash(d.key, d.value, d.salt);
        const okChain = await c.verifyAttribute(p.credentialId, leaf, d.proof);
        const okLocal = verifyProofLocally(leaf, d.proof, onChain.merkleRoot);
        checks.push({ name: `Attribute "${d.key}: ${d.value}" — Merkle proof`, ok: okChain && okLocal });
      }

      // 4) Potpis holdera nad (credentialId, nonce) — dokaz kontrole nad DID-om
      const holderMsgHash = ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32", "string"],
        [p.credentialId, p.nonce, "did-vc-dapp-presentation"]
      );
      const recovered = ethers.verifyMessage(ethers.getBytes(holderMsgHash), p.holderSignature);
      checks.push({
        name: `Holder signature — presentation signed by subject (${short(recovered)})`,
        ok: recovered.toLowerCase() === p.subject.toLowerCase(),
      });

      // 5) Replay zaštita: da li je nonce već iskorišćen?
      const used = await c.usedPresentationNonces(p.nonce);
      checks.push({ name: "Nonce not previously used (replay protection)", ok: !used });

      setResults({ checks, all: checks.every((x) => x.ok), p });
      addLog(checks.every((x) => x.ok) ? "ok" : "err",
        checks.every((x) => x.ok) ? "Presentation VALID ✔" : "Presentation NOT valid ✘");
    } catch (e) {
      addLog("err", e.reason || e.shortMessage || e.message);
    }
  }

  async function record() {
    try {
      const p = JSON.parse(input);
      const c = await getContract(true);
      const tx = await c.recordPresentation(p.credentialId, p.nonce);
      await tx.wait();
      addLog("ok", "Presentation recorded on-chain — nonce consumed (replay not possible).");
    } catch (e) {
      addLog("err", e.reason || e.shortMessage || e.message);
    }
  }

  return (
    <div className="panel">
      <h2>Verify presentation</h2>
      <input type="file" accept=".json" onChange={loadFile} />
      <label>or paste presentation.json</label>
      <textarea className="mono" rows={8} value={input} onChange={(e) => setInput(e.target.value)} />
      <div className="row">
        <button onClick={verify}>Verify</button>
        <button onClick={record}>Record on-chain (consume nonce)</button>
      </div>

      {results && (
        <div className={results.all ? "verdict ok" : "verdict bad"}>
          <h3>{results.all ? "✔ PRESENTATION VALID" : "✘ PRESENTATION NOT VALID"}</h3>
          {results.checks.map((ch, i) => (
            <div key={i} className={ch.ok ? "logline ok" : "logline err"}>
              {ch.ok ? "✔" : "✘"} {ch.name}
            </div>
          ))}
          <p className="muted" style={{ marginTop: 8 }}>
            Disclosed attributes: {results.p.disclosed.map((d) => `${d.key}=${d.value}`).join(", ")}.
            The rest remain hidden.
          </p>
        </div>
      )}
    </div>
  );
}
