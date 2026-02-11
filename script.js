// LocalStorage のキー名
const STORAGE_KEY = "studyTrackerData";

// アプリで扱う科目一覧
const SUBJECTS = ["国語", "数学", "英語", "理科", "社会"];

// 初期データ構造
const defaultData = {
  records: [],
  goal: {
    mode: "weekly",
    targetMinutes: 300,
  },
};

// 現在の記録セッション（開始時刻・科目）
const currentSession = {
  subject: null,
  startAt: null,
};

let subjectChart = null;

// ---------------------------
// LocalStorage 関連の処理
// ---------------------------

// 保存データを読み込む（不正な値の場合は初期値を返す）
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultData);

    const parsed = JSON.parse(raw);
    return {
      records: Array.isArray(parsed.records) ? parsed.records : [],
      goal: {
        mode: parsed?.goal?.mode === "weekly" ? "weekly" : "weekly",
        targetMinutes: Number(parsed?.goal?.targetMinutes) > 0
          ? Number(parsed.goal.targetMinutes)
          : 300,
      },
    };
  } catch {
    return structuredClone(defaultData);
  }
}

// データを LocalStorage に保存
function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ---------------------------
// 日付・集計処理
// ---------------------------

// YYYY-MM-DD 形式の日付文字列を作る
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 直近7日間（今日を含む）に該当する記録のみ抽出
function filterLast7Days(records) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);

  return records.filter((record) => {
    const recDate = new Date(`${record.date}T00:00:00`);
    return recDate >= start && recDate <= now;
  });
}

// 科目別の合計時間を作る
function calcSubjectTotals(records) {
  const totals = Object.fromEntries(SUBJECTS.map((subject) => [subject, 0]));
  records.forEach((record) => {
    if (totals[record.subject] !== undefined) {
      totals[record.subject] += Number(record.duration) || 0;
    }
  });
  return totals;
}

// ---------------------------
// UI 更新処理
// ---------------------------

// タブ切り替え（SPA風）
function setupTabs() {
  const tabButtons = document.querySelectorAll(".tab-btn");
  const screens = document.querySelectorAll(".screen");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      screens.forEach((s) => s.classList.remove("active"));

      btn.classList.add("active");
      const targetId = btn.dataset.screen;
      document.getElementById(targetId).classList.add("active");

      // 進捗画面に切り替えたタイミングで最新情報へ更新
      if (targetId === "progress-screen") {
        updateProgressView();
      }
    });
  });
}

// 目標値入力欄とメッセージを初期化
function initGoalView() {
  const data = loadData();
  const input = document.getElementById("targetMinutes");
  input.value = data.goal.targetMinutes;
}

// 目標保存のイベント設定
function setupGoalActions() {
  const saveBtn = document.getElementById("saveGoalBtn");
  const input = document.getElementById("targetMinutes");
  const message = document.getElementById("goalMessage");

  saveBtn.addEventListener("click", () => {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value <= 0) {
      message.textContent = "1以上の数値を入力してください。";
      return;
    }

    const data = loadData();
    data.goal = {
      mode: "weekly",
      targetMinutes: Math.round(value),
    };
    saveData(data);
    message.textContent = `目標 ${Math.round(value)} 分を保存しました。`;
    updateProgressView();
  });
}

// 記録画面の操作イベント設定
function setupRecordActions() {
  const subjectButtons = document.querySelectorAll(".subject-btn");
  const startBtn = document.getElementById("startBtn");
  const endBtn = document.getElementById("endBtn");
  const status = document.getElementById("recordStatus");

  // 科目選択
  subjectButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      subjectButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentSession.subject = btn.dataset.subject;
      status.textContent = `科目「${currentSession.subject}」を選択しました。`;
    });
  });

  // 開始時刻を記録
  startBtn.addEventListener("click", () => {
    if (!currentSession.subject) {
      status.textContent = "先に科目を選択してください。";
      return;
    }

    currentSession.startAt = new Date();
    startBtn.disabled = true;
    endBtn.disabled = false;
    status.textContent = `開始時刻を記録しました（${currentSession.startAt.toLocaleTimeString("ja-JP")}）。`;
  });

  // 終了時刻から学習時間（分）を計算して保存
  endBtn.addEventListener("click", () => {
    if (!currentSession.startAt || !currentSession.subject) {
      status.textContent = "開始してから終了してください。";
      return;
    }

    const endAt = new Date();
    const durationMinutes = Math.max(
      1,
      Math.round((endAt.getTime() - currentSession.startAt.getTime()) / 60000)
    );

    const data = loadData();
    data.records.push({
      date: formatDate(endAt),
      subject: currentSession.subject,
      duration: durationMinutes,
    });
    saveData(data);

    status.textContent = `「${currentSession.subject}」を ${durationMinutes} 分記録しました。`;

    // セッションをリセット
    currentSession.startAt = null;
    startBtn.disabled = false;
    endBtn.disabled = true;

    updateProgressView();
  });
}

// 進捗表示とグラフの更新
function updateProgressView() {
  const data = loadData();
  const recentRecords = filterLast7Days(data.records);

  const weeklyTotal = recentRecords.reduce(
    (sum, record) => sum + (Number(record.duration) || 0),
    0
  );

  const remaining = Math.max(0, data.goal.targetMinutes - weeklyTotal);
  const subjectTotals = calcSubjectTotals(recentRecords);

  document.getElementById("weeklyTotal").textContent = String(weeklyTotal);
  document.getElementById("remainingMinutes").textContent = String(remaining);

  renderChart(subjectTotals);
}

// Chart.js の棒グラフを描画
function renderChart(subjectTotals) {
  const ctx = document.getElementById("subjectChart");
  if (!ctx) return;

  const labels = SUBJECTS;
  const values = SUBJECTS.map((s) => subjectTotals[s]);

  if (subjectChart) {
    subjectChart.destroy();
  }

  subjectChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "学習時間（分）",
          data: values,
          backgroundColor: "rgba(47, 111, 237, 0.7)",
          borderColor: "rgba(47, 111, 237, 1)",
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 10,
          },
        },
      },
    },
  });
}

// ---------------------------
// 初期化
// ---------------------------

function init() {
  // 初回起動時にデータが無ければ初期値を保存
  if (!localStorage.getItem(STORAGE_KEY)) {
    saveData(structuredClone(defaultData));
  }

  setupTabs();
  initGoalView();
  setupGoalActions();
  setupRecordActions();
  updateProgressView();
}

window.addEventListener("DOMContentLoaded", init);
