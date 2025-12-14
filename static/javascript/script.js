// ===================== Editor + Line Numbers =====================
const editor = document.getElementById("editor");
const gutter = document.getElementById("gutter");

function updateLineNumbers() {
  const lines = (editor.value.match(/\n/g) || []).length + 1;
  let s = "";
  for (let i = 1; i <= lines; i++) s += i + "\n";
  gutter.textContent = s.trimEnd();
  gutter.scrollTop = editor.scrollTop;
}
editor.addEventListener("input", updateLineNumbers);
editor.addEventListener("scroll", () => (gutter.scrollTop = editor.scrollTop));
editor.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const { selectionStart, selectionEnd, value } = editor;
    const insert = "  ";
    editor.value = value.slice(0, selectionStart) + insert + value.slice(selectionEnd);
    editor.selectionStart = editor.selectionEnd = selectionStart + insert.length;
    updateLineNumbers();
  }
});

// ===================== UI =====================
const statusEl = document.getElementById("status");
const outEl = document.getElementById("output");

const btnRun = document.getElementById("btnRun");
const btnHelp = document.getElementById("btnHelp");
const btnNew = document.getElementById("btnNew");
const btnExample = document.getElementById("btnExample");
const btnClearOut = document.getElementById("btnClearOut");
const btnReset = document.getElementById("btnReset");

const consoleInput = document.getElementById("consoleInput");
const btnSend = document.getElementById("btnSend");

function setStatus(s) { statusEl.textContent = s; }
function appendOut(s) {
  outEl.value += (s ?? "") + "\n";
  outEl.scrollTop = outEl.scrollHeight;
}
function appendRaw(s) {
  outEl.value += String(s ?? "");
  outEl.scrollTop = outEl.scrollHeight;
}

// ===================== Input Bridge (Python -> JS) =====================
let waitingResolve = null;

function enableConsoleInput(on) {
  consoleInput.disabled = !on;
  btnSend.disabled = !on;
  if (on) consoleInput.focus();
}

function submitConsoleInput() {
  if (!waitingResolve) return;
  const v = consoleInput.value;
  consoleInput.value = "";
  const r = waitingResolve;
  waitingResolve = null;
  enableConsoleInput(false);
  // 사용자 입력도 콘솔에 보이게(터미널 느낌)
  appendOut(v);
  r(v);
}

consoleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    submitConsoleInput();
  }
});
btnSend.addEventListener("click", submitConsoleInput);

// Python 쪽에서 await jsPrompt("이름: ") 하면,
// 여기서 프롬프트를 출력하고 입력을 기다렸다가 값을 resolve한다.
function jsPrompt(promptText) {
  if (promptText) appendRaw(promptText);
  enableConsoleInput(true);
  return new Promise((resolve) => { waitingResolve = resolve; });
}

// ===================== Pyodide Boot =====================
let pyodide = null;

async function boot() {
  try {
    setStatus("Pyodide fetching…");
    pyodide = await loadPyodide({
      stdout: (s) => appendOut(s),
      stderr: (s) => appendOut("[에러] " + s),
    });

    setStatus("Loading hangle.py…");
    const resp = await fetch("/hangle.py", { cache: "no-store" });
    if (!resp.ok) throw new Error("hangle.py 로드 실패: " + resp.status);
    const hangleCode = await resp.text();

    setStatus("Injecting bridges…");
    pyodide.globals.set("jsPrompt", jsPrompt);

    // input()은 async로 두는 게 Pyodide에서 가장 안정적
    const BRIDGE_PY = `
import builtins
async def _hangpy_input(prompt=""):
    return await jsPrompt(str(prompt))
builtins.input = _hangpy_input
`;
    await pyodide.runPythonAsync(BRIDGE_PY);

    // 한글 매핑 주입
    await pyodide.runPythonAsync(hangleCode);

    if (!editor.value.trim()) {
      editor.value =
`출력("HangPy 준비 완료!")
이름 = 입력("이름: ")
출력("안녕,", 이름)
`;
    }

    updateLineNumbers();
    enableConsoleInput(false);

    btnRun.disabled = false;
    setStatus("Ready");
  } catch (e) {
    setStatus("Failed");
    appendOut("[초기화 오류] " + (e?.message || e));
  }
}

// ===================== Run (핵심: 입력() 자동 await) =====================
function indent(code) {
  return code.split("\n").map(line => "  " + line).join("\n");
}

//  - '입력(' 또는 'input(' 호출을 await로 바꿔준다.
//  - 이미 await가 붙은 건 건드리지 않는다.
function autoAwaitInput(code) {
  // 'await 입력('은 건드리지 않기 위해 negative lookbehind 대신 간단 전략:
  // "입력(" 앞에 "await"가 바로 있으면 패스하도록 2단계로 처리
  // 1) 임시 토큰으로 await 입력( 보호
  code = code.replace(/await\s+입력\s*\(/g, "___AWAIT_HANG_INPUT___(");
  code = code.replace(/await\s+input\s*\(/g, "___AWAIT_PY_INPUT___(");

  // 2) 남은 입력( / input( 을 await로 변환
  code = code.replace(/(^|[^가-힣A-Za-z0-9_])입력\s*\(/g, (m, p1) => `${p1}await 입력(`);
  code = code.replace(/(^|[^가-힣A-Za-z0-9_])input\s*\(/g, (m, p1) => `${p1}await input(`);

  // 3) 임시 토큰 복구
  code = code.replace(/___AWAIT_HANG_INPUT___\(/g, "await 입력(");
  code = code.replace(/___AWAIT_PY_INPUT___\(/g, "await input(");

  return code;
}

async function runCode() {
  if (!pyodide) { appendOut("[실행 불가] 아직 준비되지 않았습니다"); return; }

  appendOut("\n----- 실행 -----");

  try {
    let code = editor.value;
    code = autoAwaitInput(code);

    const wrapped = `
async def __hangpy_main__():
${indent(code)}
await __hangpy_main__()
`;
    await pyodide.runPythonAsync(wrapped);
  } catch (e) {
    appendOut("[실행 오류] " + (e?.message || e));
  }
}

// ===================== Buttons =====================
btnRun.addEventListener("click", runCode);

btnNew.addEventListener("click", () => {
  editor.value = "";
  updateLineNumbers();
});

btnHelp.addEventListener("click", () => {
  editor.value += (editor.value.endsWith("\n") ? "" : "\n") + "도움말()\n";
  updateLineNumbers();
});

btnExample.addEventListener("click", () => {
  const exampleCode = "출력(\"HangPy 준비 완료!\")\n이름 = 입력(\"이름: \")\n출력(\"안녕,\", 이름)\n도움말()\n";
  editor.value += (editor.value.endsWith("\n") ? "" : "\n") + exampleCode;
  updateLineNumbers();
});

btnClearOut.addEventListener("click", () => (outEl.value = ""));
btnReset.addEventListener("click", () => location.reload());

// ===================== Start =====================
window.addEventListener("load", () => {
  enableConsoleInput(false);
  boot();
  updateLineNumbers();
});

/* Diva Pink theme 추가 */
(function () {
  const THEMES = ["vscode", "divapink"]; // ← 디바핑크 하나만 추가
  const STORAGE_KEY = "hangpy.theme";

  function applyTheme(theme) {
    const root = document.documentElement;

    if (!theme || theme === "vscode") {
      root.removeAttribute("data-theme");
      localStorage.setItem(STORAGE_KEY, "vscode");
      return;
    }

    root.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }

  function getCurrentTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && THEMES.includes(saved)) return saved;
    return "vscode";
  }

  function nextTheme(current) {
    const i = THEMES.indexOf(current);
    return THEMES[(i + 1) % THEMES.length];
  }

  applyTheme(getCurrentTheme());

  function initFab() {
    const fab = document.getElementById("themeFab");
    if (!fab) return;

    fab.addEventListener("click", () => {
      const cur = getCurrentTheme();
      applyTheme(nextTheme(cur));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFab);
  } else {
    initFab();
  }
})();

/* =========================================================
   .kpy Save / Load (plain text)
   ========================================================= */
(function () {
  function qs(id) { return document.getElementById(id); }

  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  function suggestName() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const name = `hangpy_${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.kpy`;
    return name;
  }

  function initKpy() {
    const editor = qs("editor");
    const out = qs("output");
    const btnSave = qs("btnSaveKpy");
    const btnLoad = qs("btnLoadKpy");
    const fileInput = qs("fileKpy");

    if (!editor || !btnSave || !btnLoad || !fileInput) return;

    // 저장
    btnSave.addEventListener("click", () => {
      const filename = prompt("파일 이름을 입력하세요 (.kpy는 자동으로 붙습니다)", suggestName());
      if (!filename) return;

      const safe = filename.toLowerCase().endsWith(".kpy") ? filename : (filename + ".kpy");
      downloadTextFile(safe, editor.value);
      if (out) out.value += `\n[저장됨] ${safe}\n`;
    });

    // 불러오기 버튼 -> 파일 선택창
    btnLoad.addEventListener("click", () => fileInput.click());

    // 파일 선택 후 읽기
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;

      // 확장자 체크(엄격)
      if (!file.name.toLowerCase().endsWith(".kpy")) {
        alert(".kpy 파일만 불러올 수 있습니다.");
        fileInput.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");

        editor.value = text;

        // 만약 줄번호 갱신 함수가 있다면 호출(있을 수도/없을 수도)
        if (typeof window.updateGutter === "function") {
          window.updateGutter();
        } else {
          // 또는 기존 코드에서 쓰는 함수명이 다르면 여기만 맞춰 바꾸면 됩니다.
          // (예: renderGutterLines(), syncGutter(), refreshGutter() 등)
        }

        if (out) out.value += `\n[불러옴] ${file.name}\n`;
        fileInput.value = "";
      };

      reader.onerror = () => {
        alert("파일을 읽는 중 오류가 발생했습니다.");
        fileInput.value = "";
      };

      reader.readAsText(file, "utf-8");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initKpy);
  } else {
    initKpy();
  }
})();
