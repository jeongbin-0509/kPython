# -*- coding: utf-8 -*-
# hangle.py — import만 해도 한글 이름이 전역처럼 바로 작동하도록 builtins에 주입

import builtins
import math
import random
import time
import os
import sys
import datetime

# -----------------------------
# 1) 한글 명령어 매핑
# -----------------------------
KMAP = {
    # 입출력
    "출력": print,
    "입력": input,
    "열기": open,
    "닫기": lambda f: f.close(),

    # 기본 타입
    "정수": int,
    "실수": float,
    "문자열": str,
    "부울": bool,
    "목록": list,
    "집합": set,
    "사전": dict,
    "튜플": tuple,

    # 논리/상수/흐름 헬퍼
    "참": True,
    "거짓": False,
    "없음": None,
    "만약": lambda cond, 참값, 거짓값=None: (참값 if cond else 거짓값),

    # 반복/집계
    "반복범위": range,
    "반복": lambda n, f: [f(i) for i in range(n)],
    "모두": all,
    "하나라도": any,

    # 리스트/시퀀스
    "길이": len,
    "합계": sum,
    "최대": max,
    "최소": min,
    "추가": lambda lst, v: lst.append(v),
    "제거": lambda lst, v=None: (lst.remove(v) if v is not None else lst.pop()),
    "정렬": lambda lst, 역순=False: lst.sort(reverse=역순),
    "정렬된": lambda lst, 역순=False: sorted(lst, reverse=역순),
    "평균": lambda a: (sum(a) / len(a)) if a else 0,

    # 문자열
    "나누기": lambda s, sep=None: s.split(sep),
    "합치기": lambda lst, sep="": sep.join(lst),
    "대문자변경": lambda s: s.upper(),
    "소문자변경": lambda s: s.lower(),
    "바꾸기": lambda s, a, b: s.replace(a, b),
    "찾기": lambda s, x: s.find(x),
    "포함됨": lambda s, x: (x in s),

    # 수학/난수/시간
    "제곱": lambda x: x**2,
    "제곱근": math.sqrt,
    "절댓값": abs,
    "올림": math.ceil,
    "내림": math.floor,
    "반올림": round,
    "사인": math.sin,
    "코사인": math.cos,
    "탄젠트": math.tan,
    "파이": math.pi,
    "무작위": random,  # 모듈 자체
    "지금": datetime.datetime.now,
    "대기": time.sleep,

    # 파일/OS
    "현재경로": os.getcwd,
    "경로변경": os.chdir,
    "파일삭제": os.remove,
    "폴더목록": os.listdir,
    "만들기": os.mkdir,

    # 시스템
    "종료": sys.exit,
}

# -----------------------------
# 2) 콘솔 한글 깨짐 최소화 (가능한 환경에서만)
# -----------------------------
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

try:
    sys.stdin.reconfigure(encoding="utf-8")
except Exception:
    pass

# -----------------------------
# 3) builtins 주입 (import 없이 전역처럼 보이게)
# -----------------------------
for k, v in KMAP.items():
    if not hasattr(builtins, k):
        setattr(builtins, k, v)

# -----------------------------
# 4) 도움말: "한글명령 → 원본" 출력
#    - 함수/내장/모듈/상수 등 최대한 식별
# -----------------------------
_REVERSE_HINT = {
    # builtins
    print: "print",
    input: "input",
    open: "open",
    int: "int",
    float: "float",
    str: "str",
    bool: "bool",
    list: "list",
    set: "set",
    dict: "dict",
    tuple: "tuple",
    len: "len",
    sum: "sum",
    max: "max",
    min: "min",
    abs: "abs",
    round: "round",
    range: "range",
    all: "all",
    any: "any",

    # os
    os.getcwd: "os.getcwd",
    os.chdir: "os.chdir",
    os.remove: "os.remove",
    os.listdir: "os.listdir",
    os.mkdir: "os.mkdir",

    # sys
    sys.exit: "sys.exit",

    # math
    math.pi: "math.pi",
    math.sqrt: "math.sqrt",
    math.sin: "math.sin",
    math.cos: "math.cos",
    math.tan: "math.tan",
    math.ceil: "math.ceil",
    math.floor: "math.floor",

    # datetime/time/random
    datetime.datetime.now: "datetime.now",
    time.sleep: "time.sleep",
    random: "random (module)",
}

def 도움말():
    print("사용 가능한 한글 명령어:")
    for 이름 in sorted(KMAP.keys()):
        v = KMAP[이름]

        # 1) True/False/None 같은 상수
        if v is True:
            원본 = "True"
        elif v is False:
            원본 = "False"
        elif v is None:
            원본 = "None"
        else:
            # 2) 힌트 매핑 우선
            원본 = _REVERSE_HINT.get(v)

            # 3) lambda / 사용자 정의 함수 등은 repr로 구분
            if not 원본:
                if callable(v) and getattr(v, "__name__", "") == "<lambda>":
                    원본 = "lambda (사용자 정의)"
                elif callable(v) and getattr(v, "__module__", ""):
                    원본 = f"{v.__module__}.{getattr(v, '__name__', 'callable')}"
                else:
                    원본 = "(사용자 정의)"

        # 보기 좋게 정렬 출력
        print(f"· {이름:<10} → {원본}")
