// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CredentialRegistry
 * @notice On-chain registar izdavalaca i statusa verifikabilnih kredencijala (VC).
 *         Na lancu se cuvaju ISKLJUCIVO otisci (hash / Merkle root), status i metapodaci.
 *         Licni podaci NIKADA ne idu na blockchain - njih cuva holder kod sebe.
 *
 *         Selektivno otkrivanje: atributi kredencijala se hesiraju u Merkle stablo,
 *         a na lancu se registruje samo Merkle root. Holder kasnije otkriva samo
 *         trazene atribute uz Merkle dokaz pripadnosti.
 */
contract CredentialRegistry {
    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    address public admin;

    /// @notice Registar ovlascenih izdavalaca (DID izdavaoca = njegova adresa)
    mapping(address => bool) public authorizedIssuers;

    struct Credential {
        address issuer;      // ko je izdao kredencijal
        address subject;     // DID (adresa) korisnika na koga se odnosi
        bytes32 merkleRoot;  // koren Merkle stabla atributa (otisak, ne podaci!)
        uint256 issuedAt;    // vremenska oznaka izdavanja
        bool revoked;        // status opoziva
        uint256 revokedAt;   // vremenska oznaka opoziva
    }

    /// @notice credentialId => Credential (credentialId je hash, npr. keccak256 UUID-a)
    mapping(bytes32 => Credential) public credentials;

    /// @notice Zastita od replay napada za prezentacije: iskorisceni nonce-ovi
    mapping(bytes32 => bool) public usedPresentationNonces;

    // ---------------------------------------------------------------------
    // Events (revizorski trag - sve je vremenski obelezeno i javno proverljivo)
    // ---------------------------------------------------------------------

    event IssuerRegistered(address indexed issuer, uint256 timestamp);
    event IssuerRemoved(address indexed issuer, uint256 timestamp);
    event CredentialIssued(
        bytes32 indexed credentialId,
        address indexed issuer,
        address indexed subject,
        bytes32 merkleRoot,
        uint256 timestamp
    );
    event CredentialRevoked(bytes32 indexed credentialId, address indexed issuer, uint256 timestamp);
    event PresentationVerified(bytes32 indexed credentialId, bytes32 indexed nonce, uint256 timestamp);

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyAdmin() {
        require(msg.sender == admin, "CredentialRegistry: caller is not admin");
        _;
    }

    modifier onlyIssuer() {
        require(authorizedIssuers[msg.sender], "CredentialRegistry: caller is not an authorized issuer");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // ---------------------------------------------------------------------
    // Upravljanje izdavaocima (samo admin)
    // ---------------------------------------------------------------------

    function registerIssuer(address issuer) external onlyAdmin {
        require(issuer != address(0), "CredentialRegistry: zero address");
        require(!authorizedIssuers[issuer], "CredentialRegistry: issuer already registered");
        authorizedIssuers[issuer] = true;
        emit IssuerRegistered(issuer, block.timestamp);
    }

    function removeIssuer(address issuer) external onlyAdmin {
        require(authorizedIssuers[issuer], "CredentialRegistry: issuer not registered");
        authorizedIssuers[issuer] = false;
        emit IssuerRemoved(issuer, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Izdavanje i opoziv kredencijala
    // ---------------------------------------------------------------------

    /**
     * @notice Izdavalac registruje otisak kredencijala (Merkle root atributa).
     * @param credentialId jedinstveni identifikator (hash), NE licni podatak
     * @param subject      adresa (DID) korisnika - holdera
     * @param merkleRoot   koren Merkle stabla atributa kredencijala
     */
    function issueCredential(bytes32 credentialId, address subject, bytes32 merkleRoot) external onlyIssuer {
        require(credentials[credentialId].issuedAt == 0, "CredentialRegistry: credential already exists");
        require(subject != address(0), "CredentialRegistry: zero subject");
        require(merkleRoot != bytes32(0), "CredentialRegistry: empty merkle root");

        credentials[credentialId] = Credential({
            issuer: msg.sender,
            subject: subject,
            merkleRoot: merkleRoot,
            issuedAt: block.timestamp,
            revoked: false,
            revokedAt: 0
        });

        emit CredentialIssued(credentialId, msg.sender, subject, merkleRoot, block.timestamp);
    }

    /// @notice Opoziv - dozvoljen iskljucivo izdavaocu tog kredencijala.
    function revokeCredential(bytes32 credentialId) external {
        Credential storage c = credentials[credentialId];
        require(c.issuedAt != 0, "CredentialRegistry: unknown credential");
        require(msg.sender == c.issuer, "CredentialRegistry: only issuer can revoke");
        require(!c.revoked, "CredentialRegistry: already revoked");

        c.revoked = true;
        c.revokedAt = block.timestamp;
        emit CredentialRevoked(credentialId, msg.sender, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Verifikacija (view funkcije - besplatne za proverioce)
    // ---------------------------------------------------------------------

    /// @notice Da li je kredencijal izdat, neopozvan i od strane trenutno ovlascenog izdavaoca.
    function isCredentialValid(bytes32 credentialId) public view returns (bool) {
        Credential storage c = credentials[credentialId];
        return c.issuedAt != 0 && !c.revoked && authorizedIssuers[c.issuer];
    }

    function getCredential(bytes32 credentialId) external view returns (Credential memory) {
        return credentials[credentialId];
    }

    /**
     * @notice Provera ECDSA potpisa izdavaoca nad (credentialId, merkleRoot, subject).
     *         Potpis se generise MetaMask-om (EIP-191 personal_sign nad 32-bajtnim hash-om).
     */
    function verifyIssuerSignature(bytes32 credentialId, bytes calldata signature) external view returns (bool) {
        Credential storage c = credentials[credentialId];
        require(c.issuedAt != 0, "CredentialRegistry: unknown credential");

        bytes32 messageHash = keccak256(abi.encodePacked(credentialId, c.merkleRoot, c.subject));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        return _recoverSigner(ethSignedHash, signature) == c.issuer;
    }

    /**
     * @notice Provera Merkle dokaza za selektivno otkriveni atribut.
     * @param credentialId identifikator kredencijala
     * @param leaf         keccak256 otisak atributa: keccak256("kljuc:vrednost:salt")
     * @param proof        Merkle dokaz (sortirani parovi, kao kod OpenZeppelin MerkleProof)
     */
    function verifyAttribute(bytes32 credentialId, bytes32 leaf, bytes32[] calldata proof)
        external
        view
        returns (bool)
    {
        Credential storage c = credentials[credentialId];
        require(c.issuedAt != 0, "CredentialRegistry: unknown credential");

        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            computed = computed <= p
                ? keccak256(abi.encodePacked(computed, p))
                : keccak256(abi.encodePacked(p, computed));
        }
        return computed == c.merkleRoot;
    }

    /**
     * @notice Evidentira uspesnu verifikaciju prezentacije uz zastitu od replay napada.
     *         Nonce moze biti iskoriscen samo jednom.
     */
    function recordPresentation(bytes32 credentialId, bytes32 nonce) external {
        require(isCredentialValid(credentialId), "CredentialRegistry: credential not valid");
        require(!usedPresentationNonces[nonce], "CredentialRegistry: nonce already used (replay)");
        usedPresentationNonces[nonce] = true;
        emit PresentationVerified(credentialId, nonce, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _recoverSigner(bytes32 ethSignedHash, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "CredentialRegistry: invalid signature length");
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        address signer = ecrecover(ethSignedHash, v, r, s);
        require(signer != address(0), "CredentialRegistry: invalid signature");
        return signer;
    }
}
