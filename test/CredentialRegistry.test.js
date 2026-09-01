const { expect } = require("chai");
const { ethers } = require("hardhat");

// ---------------------------------------------------------------------------
// Pomocne funkcije - ISTA logika kao u frontend/src/merkle.js
// Leaf = keccak256(utf8("kljuc:vrednost:salt")), parovi se hesiraju SORTIRANO.
// ---------------------------------------------------------------------------

function leafHash(key, value, salt) {
  return ethers.keccak256(ethers.toUtf8Bytes(`${key}:${value}:${salt}`));
}

function hashPair(a, b) {
  return a <= b
    ? ethers.keccak256(ethers.concat([a, b]))
    : ethers.keccak256(ethers.concat([b, a]));
}

function buildMerkleTree(leaves) {
  if (leaves.length === 0) throw new Error("no leaves");
  const layers = [leaves.slice()];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      if (i + 1 < prev.length) next.push(hashPair(prev[i], prev[i + 1]));
      else next.push(prev[i]); // neparan cvor se prenosi na sledeci nivo
    }
    layers.push(next);
  }
  return { root: layers[layers.length - 1][0], layers };
}

function getMerkleProof(layers, index) {
  const proof = [];
  let idx = index;
  for (let level = 0; level < layers.length - 1; level++) {
    const layer = layers[level];
    const pairIndex = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (pairIndex < layer.length) proof.push(layer[pairIndex]);
    idx = Math.floor(idx / 2);
  }
  return proof;
}

// ---------------------------------------------------------------------------

describe("CredentialRegistry", function () {
  let registry, admin, issuer, holder, verifier, stranger;

  // Primer kredencijala: licna karta studenta
  const attributes = [
    { key: "ime", value: "Petar Petrovic", salt: "s1" },
    { key: "datumRodjenja", value: "2001-05-14", salt: "s2" },
    { key: "punoletan", value: "da", salt: "s3" },
    { key: "fakultet", value: "FIN Kragujevac", salt: "s4" },
  ];

  let leaves, tree, credentialId;

  beforeEach(async function () {
    [admin, issuer, holder, verifier, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("CredentialRegistry");
    registry = await Factory.deploy();
    await registry.waitForDeployment();

    leaves = attributes.map((a) => leafHash(a.key, a.value, a.salt));
    tree = buildMerkleTree(leaves);
    credentialId = ethers.keccak256(ethers.toUtf8Bytes("credential-uuid-0001"));
  });

  // -------------------------------------------------------------------------
  describe("Registar izdavalaca (kontrola pristupa)", function () {
    it("admin je deployer", async function () {
      expect(await registry.admin()).to.equal(admin.address);
    });

    it("admin registruje izdavaoca i emituje IssuerRegistered", async function () {
      await expect(registry.registerIssuer(issuer.address))
        .to.emit(registry, "IssuerRegistered");
      expect(await registry.authorizedIssuers(issuer.address)).to.equal(true);
    });

    it("ne-admin NE moze da registruje izdavaoca", async function () {
      await expect(
        registry.connect(stranger).registerIssuer(issuer.address)
      ).to.be.revertedWith("CredentialRegistry: caller is not admin");
    });

    it("odbija nultu adresu i duplu registraciju", async function () {
      await expect(registry.registerIssuer(ethers.ZeroAddress)).to.be.revertedWith(
        "CredentialRegistry: zero address"
      );
      await registry.registerIssuer(issuer.address);
      await expect(registry.registerIssuer(issuer.address)).to.be.revertedWith(
        "CredentialRegistry: issuer already registered"
      );
    });

    it("admin uklanja izdavaoca i emituje IssuerRemoved", async function () {
      await registry.registerIssuer(issuer.address);
      await expect(registry.removeIssuer(issuer.address)).to.emit(registry, "IssuerRemoved");
      expect(await registry.authorizedIssuers(issuer.address)).to.equal(false);
    });
  });

  // -------------------------------------------------------------------------
  describe("Izdavanje kredencijala", function () {
    beforeEach(async function () {
      await registry.registerIssuer(issuer.address);
    });

    it("ovlasceni izdavalac izdaje kredencijal i emituje CredentialIssued", async function () {
      await expect(
        registry.connect(issuer).issueCredential(credentialId, holder.address, tree.root)
      )
        .to.emit(registry, "CredentialIssued")
        .withArgs(credentialId, issuer.address, holder.address, tree.root, (t) => t > 0);

      const c = await registry.getCredential(credentialId);
      expect(c.issuer).to.equal(issuer.address);
      expect(c.subject).to.equal(holder.address);
      expect(c.merkleRoot).to.equal(tree.root);
      expect(c.revoked).to.equal(false);
      expect(c.issuedAt).to.be.greaterThan(0); // vremenska oznaka
    });

    it("neovlascena adresa NE moze da izda kredencijal", async function () {
      await expect(
        registry.connect(stranger).issueCredential(credentialId, holder.address, tree.root)
      ).to.be.revertedWith("CredentialRegistry: caller is not an authorized issuer");
    });

    it("odbija dupli credentialId, praznog subjekta i prazan root", async function () {
      await registry.connect(issuer).issueCredential(credentialId, holder.address, tree.root);
      await expect(
        registry.connect(issuer).issueCredential(credentialId, holder.address, tree.root)
      ).to.be.revertedWith("CredentialRegistry: credential already exists");

      const otherId = ethers.keccak256(ethers.toUtf8Bytes("credential-uuid-0002"));
      await expect(
        registry.connect(issuer).issueCredential(otherId, ethers.ZeroAddress, tree.root)
      ).to.be.revertedWith("CredentialRegistry: zero subject");
      await expect(
        registry.connect(issuer).issueCredential(otherId, holder.address, ethers.ZeroHash)
      ).to.be.revertedWith("CredentialRegistry: empty merkle root");
    });
  });

  // -------------------------------------------------------------------------
  describe("Status i opoziv kredencijala", function () {
    beforeEach(async function () {
      await registry.registerIssuer(issuer.address);
      await registry.connect(issuer).issueCredential(credentialId, holder.address, tree.root);
    });

    it("izdat i neopozvan kredencijal je validan", async function () {
      expect(await registry.isCredentialValid(credentialId)).to.equal(true);
    });

    it("nepostojeci kredencijal nije validan", async function () {
      const unknown = ethers.keccak256(ethers.toUtf8Bytes("ne-postoji"));
      expect(await registry.isCredentialValid(unknown)).to.equal(false);
    });

    it("izdavalac opoziva kredencijal, emituje se CredentialRevoked, validnost pada", async function () {
      await expect(registry.connect(issuer).revokeCredential(credentialId)).to.emit(
        registry,
        "CredentialRevoked"
      );
      expect(await registry.isCredentialValid(credentialId)).to.equal(false);
      const c = await registry.getCredential(credentialId);
      expect(c.revoked).to.equal(true);
      expect(c.revokedAt).to.be.greaterThan(0);
    });

    it("samo izdavalac moze da opozove; dupli opoziv se odbija", async function () {
      await expect(
        registry.connect(stranger).revokeCredential(credentialId)
      ).to.be.revertedWith("CredentialRegistry: only issuer can revoke");
      await registry.connect(issuer).revokeCredential(credentialId);
      await expect(registry.connect(issuer).revokeCredential(credentialId)).to.be.revertedWith(
        "CredentialRegistry: already revoked"
      );
    });

    it("kredencijal uklonjenog izdavaoca vise nije validan", async function () {
      await registry.removeIssuer(issuer.address);
      expect(await registry.isCredentialValid(credentialId)).to.equal(false);
    });
  });

  // -------------------------------------------------------------------------
  describe("ECDSA potpis izdavaoca", function () {
    beforeEach(async function () {
      await registry.registerIssuer(issuer.address);
      await registry.connect(issuer).issueCredential(credentialId, holder.address, tree.root);
    });

    it("prihvata validan potpis izdavaoca", async function () {
      const messageHash = ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32", "address"],
        [credentialId, tree.root, holder.address]
      );
      const signature = await issuer.signMessage(ethers.getBytes(messageHash));
      expect(await registry.verifyIssuerSignature(credentialId, signature)).to.equal(true);
    });

    it("odbija potpis pogresnog potpisnika", async function () {
      const messageHash = ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32", "address"],
        [credentialId, tree.root, holder.address]
      );
      const signature = await stranger.signMessage(ethers.getBytes(messageHash));
      expect(await registry.verifyIssuerSignature(credentialId, signature)).to.equal(false);
    });

    it("odbija potpis pogresne duzine", async function () {
      await expect(
        registry.verifyIssuerSignature(credentialId, "0x1234")
      ).to.be.revertedWith("CredentialRegistry: invalid signature length");
    });
  });

  // -------------------------------------------------------------------------
  describe("Selektivno otkrivanje (Merkle dokazi)", function () {
    beforeEach(async function () {
      await registry.registerIssuer(issuer.address);
      await registry.connect(issuer).issueCredential(credentialId, holder.address, tree.root);
    });

    it("dokazuje 'punoletan: da' BEZ otkrivanja datuma rodjenja", async function () {
      const idx = attributes.findIndex((a) => a.key === "punoletan");
      const leaf = leaves[idx];
      const proof = getMerkleProof(tree.layers, idx);
      expect(await registry.verifyAttribute(credentialId, leaf, proof)).to.equal(true);
    });

    it("svaki atribut ima validan dokaz", async function () {
      for (let i = 0; i < attributes.length; i++) {
        const proof = getMerkleProof(tree.layers, i);
        expect(await registry.verifyAttribute(credentialId, leaves[i], proof)).to.equal(true);
      }
    });

    it("odbija falsifikovan atribut (pogresna vrednost)", async function () {
      const fakeLeaf = leafHash("punoletan", "da", "pogresan-salt");
      const proof = getMerkleProof(tree.layers, 2);
      expect(await registry.verifyAttribute(credentialId, fakeLeaf, proof)).to.equal(false);
    });

    it("odbija dokaz sa pogresnim proof putem", async function () {
      const proof = getMerkleProof(tree.layers, 0); // proof za drugi list
      expect(await registry.verifyAttribute(credentialId, leaves[2], proof)).to.equal(false);
    });
  });

  // -------------------------------------------------------------------------
  describe("Zastita od replay napada (prezentacije)", function () {
    beforeEach(async function () {
      await registry.registerIssuer(issuer.address);
      await registry.connect(issuer).issueCredential(credentialId, holder.address, tree.root);
    });

    it("evidentira prezentaciju sa novim nonce-om i emituje PresentationVerified", async function () {
      const nonce = ethers.keccak256(ethers.toUtf8Bytes("challenge-123"));
      await expect(registry.connect(verifier).recordPresentation(credentialId, nonce)).to.emit(
        registry,
        "PresentationVerified"
      );
      expect(await registry.usedPresentationNonces(nonce)).to.equal(true);
    });

    it("odbija ponovno koriscenje istog nonce-a (replay)", async function () {
      const nonce = ethers.keccak256(ethers.toUtf8Bytes("challenge-123"));
      await registry.connect(verifier).recordPresentation(credentialId, nonce);
      await expect(
        registry.connect(verifier).recordPresentation(credentialId, nonce)
      ).to.be.revertedWith("CredentialRegistry: nonce already used (replay)");
    });

    it("odbija prezentaciju opozvanog kredencijala", async function () {
      await registry.connect(issuer).revokeCredential(credentialId);
      const nonce = ethers.keccak256(ethers.toUtf8Bytes("challenge-456"));
      await expect(
        registry.connect(verifier).recordPresentation(credentialId, nonce)
      ).to.be.revertedWith("CredentialRegistry: credential not valid");
    });
  });
});
