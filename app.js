"use strict";

const BASE_CHAIN_ID_DECIMAL = 8453;
const BASE_CHAIN_ID_HEX = "0x2105";
const BASE_EXPLORER = "https://basescan.org";
const BLOCKSCOUT_API = "https://base.blockscout.com/api/v2";
const GITHUB_COMMIT_SEARCH_API = "https://api.github.com/search/commits";
const MAX_DEPLOY_COUNT = 10;
const MAX_TX_BATCH = 10;
const MAX_DEPLOY_COUNT_PAGES = 40;
const PROOF_CONTRACT_CREATION_CODE = "0x33600055600b6010600039600b6000f360005460005260206000f3";

const state = {
  account: "",
  balanceWei: 0n,
  chainId: "",
  deployCount: 1,
  deployGas: 0n,
  deployTotal: null,
  deployTotalPartial: false,
  deployTotalStatus: "not-connected",
  gasPrice: 0n,
  githubCommitTotal: null,
  githubStatus: "idle",
  githubTarget: 1,
  nonce: 0,
  activeTool: "builder",
  txGas: 21000n,
  txTarget: 10,
};

const elements = {
  balance: document.querySelector("#walletBalance"),
  connectButton: document.querySelector("#connectButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  deployButton: document.querySelector("#deployButton"),
  deployEstimate: document.querySelector("#deployEstimate"),
  deployLog: document.querySelector("#deployLog"),
  deployTotal: document.querySelector("#deployTotal"),
  githubCheckButton: document.querySelector("#githubCheckButton"),
  githubCommandBlock: document.querySelector("#githubCommandBlock"),
  githubCopyButton: document.querySelector("#githubCopyButton"),
  githubCreateRepoLink: document.querySelector("#githubCreateRepoLink"),
  githubProgressFill: document.querySelector("#githubProgressFill"),
  githubProgressText: document.querySelector("#githubProgressText"),
  githubRemaining: document.querySelector("#githubRemaining"),
  githubRepo: document.querySelector("#githubRepo"),
  githubUsername: document.querySelector("#githubUsername"),
  networkStatus: document.querySelector("#networkStatus"),
  toolPanels: document.querySelectorAll("[data-tool-panel]"),
  toolTabs: document.querySelectorAll("[data-tool-tab]"),
  txBatchCount: document.querySelector("#txBatchCount"),
  txButton: document.querySelector("#txButton"),
  txEstimate: document.querySelector("#txEstimate"),
  txLog: document.querySelector("#txLog"),
  txProgressFill: document.querySelector("#txProgressFill"),
  txProgressText: document.querySelector("#txProgressText"),
  txRemaining: document.querySelector("#txRemaining"),
  walletMenu: document.querySelector("#walletMenu"),
  walletMenuAddress: document.querySelector("#walletMenuAddress"),
  walletNonce: document.querySelector("#walletNonce"),
};

function hasWallet() {
  return typeof window.ethereum !== "undefined";
}

async function walletRequest(method, params = []) {
  if (!hasWallet()) {
    throw new Error("No injected wallet found.");
  }

  return window.ethereum.request({ method, params });
}

function shortAddress(address) {
  if (!address) {
    return "-";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function toHexQuantity(value) {
  return `0x${BigInt(value).toString(16)}`;
}

function hexToBigInt(value) {
  return BigInt(value || "0x0");
}

function formatEth(wei, precision = 6) {
  const base = 10n ** 18n;
  const whole = wei / base;
  const fraction = wei % base;
  const scaledFraction = (fraction * 10n ** BigInt(precision)) / base;
  return `${whole}.${scaledFraction.toString().padStart(precision, "0")} ETH`;
}

function formatGwei(wei) {
  const base = 10n ** 9n;
  const whole = wei / base;
  const fraction = ((wei % base) * 100n) / base;
  return `${whole}.${fraction.toString().padStart(2, "0")} gwei`;
}

function formatTxCount(count) {
  return new Intl.NumberFormat("en-US").format(count);
}

function isValidGitHubUsername(username) {
  return /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username);
}

function normalizeRepoName(repoName) {
  const normalized = repoName.trim().replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 100);
  return normalized || "builder-log";
}

function setBusy(isBusy) {
  elements.connectButton.disabled = isBusy;
  elements.deployButton.disabled = isBusy || !canTransact();
  elements.txButton.disabled = isBusy || !canSendMilestoneTx();
  elements.githubCheckButton.disabled = isBusy || !isValidGitHubUsername(elements.githubUsername.value.trim());
}

function canTransact() {
  return Boolean(state.account && state.chainId === BASE_CHAIN_ID_HEX);
}

function canSendMilestoneTx() {
  return canTransact() && state.nonce < state.txTarget;
}

async function connectWallet() {
  const accounts = await walletRequest("eth_requestAccounts");
  state.account = accounts[0] || "";
  state.chainId = await walletRequest("eth_chainId");
  bindWalletEvents();

  if (state.chainId !== BASE_CHAIN_ID_HEX) {
    await switchToBase();
  }

  await refreshWalletState();
}

async function disconnectWallet() {
  if (hasWallet()) {
    try {
      await walletRequest("wallet_revokePermissions", [{ eth_accounts: {} }]);
    } catch {
      // Some injected wallets do not support permission revocation.
    }
  }

  resetWalletState();
  render();
}

function resetWalletState() {
  state.account = "";
  state.balanceWei = 0n;
  state.chainId = "";
  state.deployGas = 0n;
  state.deployTotal = null;
  state.deployTotalPartial = false;
  state.deployTotalStatus = "not-connected";
  state.gasPrice = 0n;
  state.nonce = 0;
  state.txGas = 21000n;
}

async function switchToBase() {
  try {
    await walletRequest("wallet_switchEthereumChain", [{ chainId: BASE_CHAIN_ID_HEX }]);
  } catch (error) {
    if (error.code !== 4902) {
      throw error;
    }

    await walletRequest("wallet_addEthereumChain", [
      {
        chainId: BASE_CHAIN_ID_HEX,
        chainName: "Base",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: ["https://mainnet.base.org"],
        blockExplorerUrls: [BASE_EXPLORER],
      },
    ]);
  }

  state.chainId = await walletRequest("eth_chainId");
}

function bindWalletEvents() {
  if (!hasWallet() || window.__baseBuilderEventsBound) {
    return;
  }

  window.__baseBuilderEventsBound = true;
  window.ethereum.on("accountsChanged", async (accounts) => {
    state.account = accounts[0] || "";
    await refreshWalletState();
  });

  window.ethereum.on("chainChanged", async (chainId) => {
    state.chainId = chainId;
    await refreshWalletState();
  });
}

async function refreshWalletState() {
  if (!state.account) {
    render();
    return;
  }

  state.chainId = await walletRequest("eth_chainId");
  if (state.chainId === BASE_CHAIN_ID_HEX) {
    state.deployTotalStatus = "loading";
    render();

    const [balance, nonce, gasPrice, deployGas, txGas] = await Promise.all([
      walletRequest("eth_getBalance", [state.account, "latest"]),
      walletRequest("eth_getTransactionCount", [state.account, "latest"]),
      walletRequest("eth_gasPrice"),
      estimateDeployGas().catch(() => "0x0"),
      estimateSelfTransferGas().catch(() => "0x5208"),
    ]);

    state.balanceWei = hexToBigInt(balance);
    state.nonce = Number.parseInt(nonce, 16);
    state.gasPrice = hexToBigInt(gasPrice);
    state.deployGas = hexToBigInt(deployGas);
    state.txGas = hexToBigInt(txGas);
    await refreshDeployTotal();
  }

  render();
}

async function refreshDeployTotal() {
  try {
    const result = await fetchDeployTotal(state.account);
    state.deployTotal = result.count;
    state.deployTotalPartial = result.partial;
    state.deployTotalStatus = "ready";
  } catch {
    state.deployTotal = null;
    state.deployTotalPartial = false;
    state.deployTotalStatus = "unavailable";
  }
}

async function fetchDeployTotal(address) {
  const wallet = address.toLowerCase();
  let count = 0;
  let nextPageParams = null;
  let page = 0;

  do {
    const url = new URL(`${BLOCKSCOUT_API}/addresses/${address}/transactions`);
    if (nextPageParams) {
      for (const [key, value] of Object.entries(nextPageParams)) {
        if (value !== null && value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Blockscout request failed.");
    }

    const body = await response.json();
    for (const tx of body.items || []) {
      if (isWalletContractDeploy(tx, wallet)) {
        count += 1;
      }
    }

    nextPageParams = body.next_page_params;
    page += 1;
  } while (nextPageParams && page < MAX_DEPLOY_COUNT_PAGES);

  return {
    count,
    partial: Boolean(nextPageParams),
  };
}

function isWalletContractDeploy(tx, wallet) {
  const fromHash = tx?.from?.hash?.toLowerCase();
  if (fromHash !== wallet || tx.status !== "ok" || tx.result !== "success") {
    return false;
  }

  if (tx.created_contract) {
    return true;
  }

  return tx.to === null || (tx.transaction_types || []).includes("contract_creation");
}

async function checkGitHubCommits() {
  const username = elements.githubUsername.value.trim();
  if (!isValidGitHubUsername(username)) {
    state.githubCommitTotal = null;
    state.githubStatus = "invalid";
    render();
    return;
  }

  state.githubStatus = "loading";
  render();

  try {
    state.githubCommitTotal = await fetchGitHubCommitTotal(username);
    state.githubStatus = "ready";
  } catch {
    state.githubCommitTotal = null;
    state.githubStatus = "unavailable";
  }

  render();
}

async function fetchGitHubCommitTotal(username) {
  const url = new URL(GITHUB_COMMIT_SEARCH_API);
  url.searchParams.set("q", `author:${username}`);
  url.searchParams.set("per_page", "1");

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error("GitHub request failed.");
  }

  const body = await response.json();
  return Number.isFinite(body.total_count) ? body.total_count : 0;
}

async function estimateDeployGas() {
  return walletRequest("eth_estimateGas", [
    {
      from: state.account,
      data: PROOF_CONTRACT_CREATION_CODE,
      value: "0x0",
    },
  ]);
}

async function estimateSelfTransferGas() {
  return walletRequest("eth_estimateGas", [
    {
      from: state.account,
      to: state.account,
      value: "0x0",
    },
  ]);
}

async function deployContracts() {
  await ensureReady();
  const count = clampInteger(state.deployCount, 1, MAX_DEPLOY_COUNT);
  const estimatedCost = state.deployGas * state.gasPrice * BigInt(count);

  if (state.balanceWei < estimatedCost) {
    throw new Error("Wallet balance is below estimated gas cost.");
  }

  const ok = window.confirm(
    `Deploy ${count} contract transaction(s) on Base?\nEstimated max gas: ${formatEth(estimatedCost, 8)}`,
  );
  if (!ok) {
    return;
  }

  setBusy(true);
  try {
    for (let index = 0; index < count; index += 1) {
      const activity = addDeployActivity(index + 1, count);
      const txHash = await walletRequest("eth_sendTransaction", [
        {
          from: state.account,
          data: PROOF_CONTRACT_CREATION_CODE,
          value: "0x0",
        },
      ]);

      setDeployActivity(activity, txHash);
      const receipt = await waitForReceipt(txHash);
      const contractAddress = receipt.contractAddress || "Contract created";
      setDeployActivity(activity, txHash, contractAddress);
      await refreshWalletState();
    }
  } finally {
    setBusy(false);
    await refreshWalletState();
  }
}

async function sendMinimalTransactions() {
  await ensureReady();
  const remaining = Math.max(state.txTarget - state.nonce, 0);
  if (remaining === 0) {
    addActivity(elements.txLog, "Milestone reached", `${formatTxCount(state.txTarget)} transactions`);
    return;
  }

  const batchCount = clampInteger(Number.parseInt(elements.txBatchCount.value, 10), 1, MAX_TX_BATCH);
  const count = Math.min(batchCount, remaining);
  const estimatedCost = state.txGas * state.gasPrice * BigInt(count);

  if (state.balanceWei < estimatedCost) {
    throw new Error("Wallet balance is below estimated gas cost.");
  }

  const ok = window.confirm(
    `Send ${count} zero-value self transaction(s) on Base?\nEstimated max gas: ${formatEth(estimatedCost, 8)}`,
  );
  if (!ok) {
    return;
  }

  setBusy(true);
  try {
    for (let index = 0; index < count; index += 1) {
      addActivity(elements.txLog, `Tx ${index + 1}/${count}`, "Waiting for wallet confirmation");
      const txHash = await walletRequest("eth_sendTransaction", [
        {
          from: state.account,
          to: state.account,
          value: "0x0",
        },
      ]);

      updateLastActivity(elements.txLog, `Tx ${index + 1}/${count}`, txHash, `${BASE_EXPLORER}/tx/${txHash}`);
      await waitForReceipt(txHash);
      await refreshWalletState();
    }
  } finally {
    setBusy(false);
    await refreshWalletState();
  }
}

async function ensureReady() {
  if (!state.account) {
    await connectWallet();
  }

  if (state.chainId !== BASE_CHAIN_ID_HEX) {
    await switchToBase();
    await refreshWalletState();
  }

  if (!canTransact()) {
    throw new Error("Wallet is not connected to Base mainnet.");
  }
}

async function waitForReceipt(txHash) {
  for (;;) {
    const receipt = await walletRequest("eth_getTransactionReceipt", [txHash]);
    if (receipt) {
      if (receipt.status !== "0x1") {
        throw new Error(`Transaction failed: ${txHash}`);
      }

      return receipt;
    }

    await delay(1800);
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function clampInteger(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}

function addActivity(container, title, detail, href = "") {
  const item = document.createElement("div");
  item.className = "activity-item";
  item.innerHTML = `<strong></strong><span></span>`;
  item.querySelector("strong").textContent = title;
  setActivityDetail(item, detail, href);
  container.prepend(item);
}

function addDeployActivity(current, total) {
  const item = document.createElement("div");
  item.className = "activity-item deploy-activity";
  item.innerHTML = `
    <strong></strong>
    <div class="activity-links">
      <span data-role="contract">Contract: waiting for receipt</span>
      <span data-role="tx">Tx: waiting for wallet confirmation</span>
    </div>
  `;
  item.querySelector("strong").textContent = `Deploy ${current}/${total}`;
  elements.deployLog.prepend(item);
  return item;
}

function setDeployActivity(item, txHash, contractAddress = "") {
  const txTarget = item.querySelector('[data-role="tx"]');
  const contractTarget = item.querySelector('[data-role="contract"]');

  replaceDetailNode(txTarget, `Tx: ${txHash}`, `${BASE_EXPLORER}/tx/${txHash}`, "tx");

  if (contractAddress) {
    replaceDetailNode(
      contractTarget,
      `Contract: ${contractAddress}`,
      `${BASE_EXPLORER}/address/${contractAddress}`,
      "contract",
    );
  }
}

function updateLastActivity(container, title, detail, href = "") {
  const item = container.firstElementChild;
  if (!item) {
    addActivity(container, title, detail, href);
    return;
  }

  item.querySelector("strong").textContent = title;
  setActivityDetail(item, detail, href);
}

function setActivityDetail(item, detail, href) {
  const oldDetail = item.querySelector("span, a");
  replaceDetailNode(oldDetail, detail, href);
}

function replaceDetailNode(oldDetail, detail, href, role = "") {
  const nextDetail = document.createElement(href ? "a" : "span");
  nextDetail.textContent = detail;
  if (role) {
    nextDetail.dataset.role = role;
  }

  if (href) {
    nextDetail.href = href;
    nextDetail.target = "_blank";
    nextDetail.rel = "noreferrer";
  }

  oldDetail.replaceWith(nextDetail);
}

function setSelectedButton(selector, attribute, value) {
  document.querySelectorAll(selector).forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute(attribute) === String(value));
  });
}

function renderActiveTool() {
  elements.toolTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.toolTab === state.activeTool);
  });

  elements.toolPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.toolPanel === state.activeTool);
  });
}

function render() {
  const onBase = state.chainId === BASE_CHAIN_ID_HEX;
  elements.balance.textContent = state.account && onBase ? formatEth(state.balanceWei, 5) : "-";
  elements.walletNonce.textContent = state.account && onBase ? formatTxCount(state.nonce) : "-";
  elements.deployTotal.textContent = getDeployTotalLabel(onBase);
  elements.connectButton.textContent = state.account ? shortAddress(state.account) : "Connect Wallet";
  elements.connectButton.classList.toggle("is-connected", Boolean(state.account));
  elements.connectButton.setAttribute("aria-expanded", "false");
  elements.walletMenu.hidden = !state.account;
  elements.walletMenuAddress.textContent = state.account || "-";
  elements.networkStatus.textContent = state.account ? (onBase ? "Base connected" : "Wrong network") : "Not connected";
  elements.networkStatus.classList.toggle("is-ready", state.account && onBase);

  const deployEstimate = state.deployGas * state.gasPrice * BigInt(state.deployCount);
  elements.deployEstimate.textContent =
    state.account && onBase && state.deployGas > 0n ? formatEth(deployEstimate, 8) : "Connect wallet";

  const remaining = Math.max(state.txTarget - state.nonce, 0);
  const maxAllowedBatch = Math.max(Math.min(remaining, MAX_TX_BATCH), 1);
  const batchCount = clampInteger(Number.parseInt(elements.txBatchCount.value, 10), 1, maxAllowedBatch);
  elements.txBatchCount.max = String(maxAllowedBatch);
  elements.txBatchCount.value = String(batchCount);
  const txEstimate = state.txGas * state.gasPrice * BigInt(batchCount);
  elements.txEstimate.textContent = state.account && onBase ? formatEth(txEstimate, 8) : "Connect wallet";
  elements.txProgressText.textContent = state.account && onBase ? `${formatTxCount(state.nonce)} / ${formatTxCount(state.txTarget)}` : "Connect wallet";
  elements.txRemaining.textContent = state.account && onBase ? `${formatTxCount(remaining)} left` : "-";
  elements.txProgressFill.style.width = `${Math.min((state.nonce / state.txTarget) * 100, 100)}%`;

  elements.deployButton.disabled = !canTransact();
  elements.txButton.disabled = !canSendMilestoneTx();
  setSelectedButton("[data-deploy-count]", "data-deploy-count", state.deployCount);
  setSelectedButton("[data-tx-target]", "data-tx-target", state.txTarget);
  renderActiveTool();
  renderGitHubPanel();
}

function getDeployTotalLabel(onBase) {
  if (!state.account || !onBase) {
    return "-";
  }

  if (state.deployTotalStatus === "loading") {
    return "Loading";
  }

  if (state.deployTotalStatus === "unavailable") {
    return "Unavailable";
  }

  if (state.deployTotal === null) {
    return "-";
  }

  const suffix = state.deployTotalPartial ? "+" : "";
  return `${formatTxCount(state.deployTotal)}${suffix}`;
}

function renderGitHubPanel() {
  const username = elements.githubUsername.value.trim();
  const repo = normalizeRepoName(elements.githubRepo.value);
  const hasValidUsername = isValidGitHubUsername(username);
  const total = state.githubCommitTotal ?? 0;
  const remaining = state.githubCommitTotal === null ? state.githubTarget : Math.max(state.githubTarget - total, 0);
  const progress = state.githubCommitTotal === null ? 0 : Math.min((total / state.githubTarget) * 100, 100);

  elements.githubRepo.value = repo;
  elements.githubCreateRepoLink.href = `https://github.com/new?visibility=public&name=${encodeURIComponent(repo)}`;
  elements.githubCheckButton.disabled = !hasValidUsername;
  elements.githubCommandBlock.textContent = buildGitHubCommands(username, repo, state.githubTarget);
  elements.githubProgressFill.style.width = `${progress}%`;
  elements.githubRemaining.textContent = hasValidUsername ? `${formatTxCount(remaining)} left` : "-";
  elements.githubProgressText.textContent = getGitHubProgressText(username, total);
  setSelectedButton("[data-github-target]", "data-github-target", state.githubTarget);
}

function getGitHubProgressText(username, total) {
  if (!username) {
    return "Enter username";
  }

  if (!isValidGitHubUsername(username)) {
    return "Invalid username";
  }

  if (state.githubStatus === "loading") {
    return "Checking public commits";
  }

  if (state.githubStatus === "unavailable") {
    return "GitHub check unavailable";
  }

  if (state.githubStatus === "ready") {
    return `${formatTxCount(total)} / ${formatTxCount(state.githubTarget)}`;
  }

  return "Ready to check";
}

function buildGitHubCommands(username, repo, target) {
  if (!isValidGitHubUsername(username)) {
    return "# Enter your GitHub username to generate commands.";
  }

  return [
    "if (-not (Get-Command git -ErrorAction SilentlyContinue)) {",
    '  Write-Host "Git bulunamadi. Git for Windows kuruluyor..." -ForegroundColor Yellow',
    "  if (Get-Command winget -ErrorAction SilentlyContinue) {",
    "    winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements",
    "  } else {",
    '    Write-Host "winget bulunamadi. Git kurulum sayfasi aciliyor." -ForegroundColor Yellow',
    '    Start-Process "https://git-scm.com/download/win"',
    '    Write-Host "Git kurulduktan sonra PowerShelli kapatip yeniden acin ve komutlari tekrar calistirin." -ForegroundColor Cyan',
    "    exit 1",
    "  }",
    '  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")',
    '  $gitCmd = Join-Path $env:ProgramFiles "Git\\cmd"',
    '  if (Test-Path (Join-Path $gitCmd "git.exe")) { $env:Path = "$gitCmd;$env:Path" }',
    "}",
    "if (-not (Get-Command git -ErrorAction SilentlyContinue)) {",
    '  Write-Host "Git kurulduysa PowerShelli kapatip yeniden acin ve komutlari tekrar calistirin." -ForegroundColor Cyan',
    "  exit 1",
    "}",
    "git --version",
    `$user = "${username}"`,
    `$repo = "${repo}"`,
    `$target = ${target}`,
    '$repoUrl = "https://github.com/$user/$repo.git"',
    "Set-Location $HOME",
    'if (Test-Path $repo) { Set-Location $repo } else { git clone $repoUrl $repo; if ($LASTEXITCODE -eq 0) { Set-Location $repo } else { New-Item -ItemType Directory -Force $repo | Out-Null; Set-Location $repo; git init; git branch -M main; git remote add origin $repoUrl } }',
    'git config --local "user.name" $user',
    'git config --local "user.email" "$user@users.noreply.github.com"',
    "git pull --rebase origin main",
    'if (-not (Test-Path README.md)) { "# $repo" | Set-Content README.md }',
    'if (-not (Test-Path progress.md)) { "" | Set-Content progress.md }',
    '1..$target | ForEach-Object { Add-Content progress.md "$_ $(Get-Date -Format o)"; git add README.md progress.md; git commit -m "Update builder log $_" }',
    "git push -u origin main",
  ].join("\n");
}

async function copyGitHubCommands() {
  const text = elements.githubCommandBlock.textContent.trim();
  if (!text || text.startsWith("# Enter")) {
    return;
  }

  await navigator.clipboard.writeText(text);
  const previous = elements.githubCopyButton.textContent;
  elements.githubCopyButton.textContent = "Copied";
  window.setTimeout(() => {
    elements.githubCopyButton.textContent = previous;
  }, 1200);
}

function showError(error) {
  const message = error?.message || String(error);
  addActivity(elements.txLog, "Error", message);
}

function bindUi() {
  elements.connectButton.addEventListener("click", async () => {
    try {
      if (state.account) {
        return;
      } else {
        await connectWallet();
      }
    } catch (error) {
      showError(error);
    }
  });

  elements.disconnectButton.addEventListener("click", async () => {
    await disconnectWallet();
  });

  elements.deployButton.addEventListener("click", async () => {
    try {
      await deployContracts();
    } catch (error) {
      addActivity(elements.deployLog, "Error", error?.message || String(error));
    }
  });

  elements.txButton.addEventListener("click", async () => {
    try {
      await sendMinimalTransactions();
    } catch (error) {
      showError(error);
    }
  });

  elements.githubCheckButton.addEventListener("click", async () => {
    await checkGitHubCommits();
  });

  elements.githubCopyButton.addEventListener("click", async () => {
    try {
      await copyGitHubCommands();
    } catch (error) {
      state.githubStatus = "unavailable";
      render();
    }
  });

  elements.githubUsername.addEventListener("input", () => {
    state.githubCommitTotal = null;
    state.githubStatus = "idle";
    render();
  });

  elements.githubRepo.addEventListener("input", () => {
    render();
  });

  elements.txBatchCount.addEventListener("input", () => {
    elements.txBatchCount.value = String(clampInteger(Number.parseInt(elements.txBatchCount.value, 10), 1, MAX_TX_BATCH));
    render();
  });

  elements.toolTabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTool = button.dataset.toolTab;
      render();
    });
  });

  document.querySelectorAll("[data-deploy-count]").forEach((button) => {
    button.addEventListener("click", () => {
      state.deployCount = clampInteger(Number.parseInt(button.dataset.deployCount, 10), 1, MAX_DEPLOY_COUNT);
      render();
    });
  });

  document.querySelectorAll("[data-tx-target]").forEach((button) => {
    button.addEventListener("click", () => {
      state.txTarget = clampInteger(Number.parseInt(button.dataset.txTarget, 10), 10, 1000);
      render();
    });
  });

  document.querySelectorAll("[data-github-target]").forEach((button) => {
    button.addEventListener("click", () => {
      state.githubTarget = clampInteger(Number.parseInt(button.dataset.githubTarget, 10), 1, 100);
      render();
    });
  });
}

bindUi();
render();
