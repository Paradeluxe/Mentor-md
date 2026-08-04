# Word COM smoke
import sys, tempfile, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def ensure_docx():
    out = ROOT / "tmp" / "export-smoke.docx"
    if out.exists() and out.stat().st_size > 100:
        return out
    out.parent.mkdir(exist_ok=True)
    r = subprocess.run(["node", str(ROOT / "tmp" / "gen-min-docx.js"), str(out)], cwd=str(ROOT))
    if r.returncode != 0 or not out.exists():
        raise SystemExit("gen docx failed")
    return out

def main():
    try:
        import win32com.client
    except Exception as e:
        print("SKIP no pywin32:", e)
        return 0
    src = ensure_docx()
    tmp = Path(tempfile.gettempdir()) / "mentor-word-com-smoke.docx"
    tmp.write_bytes(src.read_bytes())
    word = doc = None
    try:
        word = win32com.client.DispatchEx("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0
        doc = word.Documents.Open(str(tmp), ReadOnly=True)
        text = doc.Content.Text or ""
        print("WORD_TEXT", repr(text[:160]))
        if len(text.strip()) < 2:
            print("FAIL empty")
            return 1
        print("PASS word-com-docx-smoke")
        return 0
    except Exception as e:
        print("FAIL Word COM", e)
        return 1
    finally:
        try:
            if doc is not None:
                doc.Close(False)
        except Exception:
            pass
        try:
            if word is not None:
                word.Quit()
        except Exception:
            pass

if __name__ == "__main__":
    sys.exit(main())
