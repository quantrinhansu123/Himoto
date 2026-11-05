"""Retain timestamp-scoped Android evidence on both acceptance and failure."""
import json
import re


def recent_lines(buffer, since):
    if since is None:
        return []
    return [line for line in buffer.splitlines() if (match := re.match(r"^\s*(\d+\.\d+)\s", line)) and float(match[1]) >= since]


def verdict(crashes, anrs, since, package):
    if since is None:
        return {"newAppCrashes": None, "newAppAnrs": None, "newSystemUiAnrs": None}
    return {
        "newAppCrashes": sum(f"Process: {package}," in line or f">>> {package} <<<" in line for line in recent_lines(crashes, since)),
        "newAppAnrs": sum(f",{package}," in line for line in recent_lines(anrs, since)),
        "newSystemUiAnrs": sum(",com.android.systemui," in line for line in recent_lines(anrs, since)),
    }


def physical_evidence(crashes,anrs,since,package):
    # A personal phone contains unrelated app logs. Keep only timestamped
    # Himoto crash markers and Himoto/SystemUI ANR events in QA artifacts.
    crash_lines=[line for line in recent_lines(crashes,since) if f"Process: {package}," in line or f">>> {package} <<<" in line]
    anr_lines=[line for line in recent_lines(anrs,since) if f",{package}," in line or ",com.android.systemui," in line]
    return "\n".join(crash_lines),"\n".join(anr_lines)


def collect(qa, package):
    buffers, errors = {}, []
    for name, args in [("crash", ("logcat", "-b", "crash", "-d", "-v", "epoch")),
                       ("anr", ("logcat", "-b", "events", "-d", "-v", "epoch", "-s", "am_anr"))]:
        try:
            buffers[name] = qa.command(*args)
            if not getattr(qa,'physical',False):
                qa.output.joinpath(f"{name}-buffer.log").write_text(buffers[name], encoding="utf-8")
        except Exception as error:
            errors.append(f"{name}: {type(error).__name__}")
    if getattr(qa,'physical',False):
        scoped=physical_evidence(buffers.get('crash',''),buffers.get('anr',''),qa.started_epoch,package)
        for name,value in zip(('crash','anr'),scoped):
            qa.output.joinpath(f"{name}-buffer.log").write_text(value,encoding='utf-8')
        result=verdict(*scoped,qa.started_epoch,package)
    else:
        result = verdict(buffers.get("crash", ""), buffers.get("anr", ""), qa.started_epoch, package)
    if "crash" not in buffers:
        result["newAppCrashes"] = None
    if "anr" not in buffers:
        result["newAppAnrs"] = result["newSystemUiAnrs"] = None
    result.update(startedEpoch=qa.started_epoch, errors=errors)
    qa.output.joinpath("runtime-diagnostics.json").write_text(json.dumps(result, indent=2)+"\n", encoding="utf-8")
    return result
