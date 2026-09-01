// ============================================================================
// OVDE UPISI ADRESU UGOVORA nakon deploy-a na Sepolia mrezu!
// (dobijas je iz: npm run deploy:sepolia)
// ============================================================================
export const CONTRACT_ADDRESS = "0x4fBb1BA8167C05b5021Bb475Eef29572577E9e7e";

export const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111

// Human-readable ABI (ethers v6)
export const CONTRACT_ABI = [
  "function admin() view returns (address)",
  "function authorizedIssuers(address) view returns (bool)",
  "function registerIssuer(address issuer)",
  "function removeIssuer(address issuer)",
  "function issueCredential(bytes32 credentialId, address subject, bytes32 merkleRoot)",
  "function revokeCredential(bytes32 credentialId)",
  "function isCredentialValid(bytes32 credentialId) view returns (bool)",
  "function getCredential(bytes32 credentialId) view returns (tuple(address issuer, address subject, bytes32 merkleRoot, uint256 issuedAt, bool revoked, uint256 revokedAt))",
  "function verifyIssuerSignature(bytes32 credentialId, bytes signature) view returns (bool)",
  "function verifyAttribute(bytes32 credentialId, bytes32 leaf, bytes32[] proof) view returns (bool)",
  "function recordPresentation(bytes32 credentialId, bytes32 nonce)",
  "function usedPresentationNonces(bytes32) view returns (bool)",
  "event IssuerRegistered(address indexed issuer, uint256 timestamp)",
  "event IssuerRemoved(address indexed issuer, uint256 timestamp)",
  "event CredentialIssued(bytes32 indexed credentialId, address indexed issuer, address indexed subject, bytes32 merkleRoot, uint256 timestamp)",
  "event CredentialRevoked(bytes32 indexed credentialId, address indexed issuer, uint256 timestamp)",
  "event PresentationVerified(bytes32 indexed credentialId, bytes32 indexed nonce, uint256 timestamp)",
];
