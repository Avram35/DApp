const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");

  const CredentialRegistry = await hre.ethers.getContractFactory("CredentialRegistry");
  const registry = await CredentialRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("\n=======================================================");
  console.log("CredentialRegistry deployed to:", address);
  console.log("Admin (deployer):", deployer.address);
  console.log("=======================================================");
  console.log("\nSledeci koraci:");
  console.log("1. Upisi ovu adresu u frontend/src/contract.js (CONTRACT_ADDRESS)");
  console.log("2. Proveri ugovor na https://sepolia.etherscan.io/address/" + address);
  console.log("3. (Opciono) Verifikuj kod: npx hardhat verify --network sepolia " + address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
