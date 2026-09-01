// Merkle stablo atributa - ISTA logika kao u testovima i u ugovoru (verifyAttribute).
// Leaf = keccak256(utf8("kljuc:vrednost:salt")); parovi se hesiraju SORTIRANO;
// neparan cvor se prenosi na sledeci nivo neizmenjen.

import { ethers } from "ethers";

export function leafHash(key, value, salt) {
  return ethers.keccak256(ethers.toUtf8Bytes(`${key}:${value}:${salt}`));
}

export function hashPair(a, b) {
  return a <= b
    ? ethers.keccak256(ethers.concat([a, b]))
    : ethers.keccak256(ethers.concat([b, a]));
}

export function buildMerkleTree(leaves) {
  if (leaves.length === 0) throw new Error("Merkle tree must have at least one leaf");
  const layers = [leaves.slice()];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      if (i + 1 < prev.length) next.push(hashPair(prev[i], prev[i + 1]));
      else next.push(prev[i]);
    }
    layers.push(next);
  }
  return { root: layers[layers.length - 1][0], layers };
}

export function getMerkleProof(layers, index) {
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

export function verifyProofLocally(leaf, proof, root) {
  let computed = leaf;
  for (const p of proof) computed = hashPair(computed, p);
  return computed === root;
}

/** Nasumican salt dovoljne entropije (16 bajtova) */
export function randomSalt() {
  return ethers.hexlify(ethers.randomBytes(16));
}
