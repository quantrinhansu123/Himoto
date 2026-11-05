"""Fingerprint native QA inputs without reading local environment or credentials."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def source_snapshot():
    files = [path for folder in ("mobile/src", "mobile/assets", "shared") for path in (ROOT/folder).rglob("*") if path.is_file()]
    files += [ROOT/path for path in ("mobile/package.json", "mobile/package-lock.json", "mobile/app.json", "mobile/app.config.cjs", "mobile/metro.config.js", "mobile/eslint.config.js", "scripts/requirements-mobile-qa.txt")]
    files += [ROOT/path for path in ("scripts/check-mobile-native.py", "scripts/lib/mobile_renewal_native.py",
        "scripts/lib/mobile_native_provenance.py", "scripts/lib/mobile_native_diagnostics.py",
        "scripts/mobile-fixture-server.py", "scripts/lib/mobile_renewal_fixture.py", "scripts/lib/mobile_recovery_fixture.py",
        "scripts/lib/mobile_collection_fixture.py", "scripts/lib/mobile_collection_native.py", "scripts/lib/mobile_native_keyboard.py",
        "scripts/check-mobile-collection-selected.py", "scripts/check-mobile-pending-bill-native.py")]
    files += [ROOT/path for path in ("scripts/check-mobile-return-native.py","scripts/check-mobile-return-reopen-native.py","scripts/lib/mobile_return_fixture.py","scripts/lib/mobile_return_ui.py")]
    files += [ROOT/path for path in ("scripts/check-mobile-swap-native.py","scripts/lib/mobile_swap_fixture.py","scripts/lib/mobile_swap_ui.py")]
    files += [ROOT/path for path in ("scripts/check-mobile-transfer-native.py","scripts/mobile-transfer-fixture-server.py","scripts/lib/mobile_vehicle_transfer_fixture.py","scripts/lib/mobile_fixture_journal.py")]
    files += [ROOT/"scripts/check-mobile-login-native.py"]
    files += [ROOT/"scripts/check-mobile-contract-work-native.py"]
    files += [ROOT/"scripts/check-mobile-draft-work-native.py"]
    files += [ROOT/"scripts/check-mobile-draft-work-copy-native.py"]
    files += [ROOT/path for path in ("scripts/check-mobile-vehicles-native.py", "scripts/mobile-vehicle-fixture-server.py", "scripts/lib/mobile_vehicle_workspace_fixture.py", "scripts/lib/mobile_stores_fixture.py")]
    files += [ROOT/"scripts/check-mobile-stores-native.py"]
    files += [ROOT/"scripts/lib/mobile_staff_fixture.py"]
    files += [ROOT/"scripts/check-mobile-staff-native.py"]
    files += [ROOT/path for path in ("scripts/check-mobile-cashbook-native.py", "scripts/lib/mobile_cashbook_fixture.py")]
    files += [ROOT/"scripts/check-mobile-cashbook-export-native.py"]
    files += [ROOT/path for path in ("scripts/lib/mobile_cashbook_bulk_fixture.py", "scripts/check-mobile-cashbook-delete-native.py")]
    files += [ROOT/path for path in ("scripts/lib/mobile_reports_fixture.py", "scripts/check-mobile-reports-native.py")]
    files += [ROOT/path for path in ("scripts/lib/mobile_debt_reminders_fixture.py", "scripts/check-mobile-debt-reminders-native.py")]
    files += [ROOT/path for path in ("scripts/lib/mobile_shift_reports_fixture.py", "scripts/check-mobile-shift-reports-native.py")]
    files += [ROOT/path for path in ("scripts/lib/mobile_battery_fixture.py", "scripts/check-mobile-battery-native.py")]
    files += [ROOT/path for path in ("scripts/lib/mobile_contract_types_fixture.py", "scripts/check-mobile-contract-types-native.py")]
    files += [ROOT/path for path in ("scripts/lib/mobile_managed_accounts_fixture.py", "scripts/check-mobile-managed-accounts-native.py")]
    files += [ROOT/path for path in ("scripts/lib/mobile_integrations_fixture.py", "scripts/check-mobile-integrations-native.py")]
    files += [ROOT/path for path in ("scripts/lib/mobile_backfill_fixture.py", "scripts/check-mobile-backfill-native.py")]
    files += [ROOT/path for path in ("scripts/lib/mobile_renewal_parity_fixture.py", "scripts/check-mobile-renewal-parity-native.py")]
    files += [ROOT/path for path in ("scripts/lib/mobile_contract_approval_fixture.py", "scripts/check-mobile-contract-approval-native.py")]
    files += [ROOT/path for path in ("scripts/lib/mobile_contract_edit_fixture.py", "scripts/check-mobile-contract-edit-native.py")]
    files += [ROOT/path for path in ("scripts/lib/mobile_contract_corrections_fixture.py", "scripts/check-mobile-contract-corrections-native.py")]
    files += [ROOT/path for path in ("scripts/lib/mobile_contract_lifecycle_fixture.py", "scripts/check-mobile-contract-lifecycle-native.py")]
    files += [ROOT/path for path in ("scripts/lib/mobile_return_corrections_fixture.py", "scripts/check-mobile-return-corrections-native.py")]
    files += [ROOT/path for path in ("scripts/lib/mobile_terms_actions_fixture.py", "scripts/check-mobile-terms-actions-native.py")]
    files += [ROOT/path for path in ("scripts/lib/mobile_print_import_fixture.py", "scripts/check-mobile-print-import-native.py")]
    files += [ROOT/"scripts/check-mobile-record-video-native.py"]
    files += [ROOT/path for path in ("scripts/check-mobile-demo-native.py", "scripts/mobile-demo-fixture-server.py", "scripts/lib/mobile_demo_workspace_fixture.py", "scripts/lib/mobile_work_access_fixture.py", "scripts/check-mobile-draft-work-access.cjs")]
    files += [ROOT/"scripts/check-mobile-draft-work-transitions-native.py", ROOT/"scripts/fixtures/mobile-draft.json"]
    files += [ROOT/path for path in ("scripts/check-mobile-contract-photos-native.py", "scripts/check-mobile-contract-photos-ui.py", "scripts/check-mobile-contract-photos-fixture.py", "scripts/lib/mobile_contract_photos_fixture.py")]
    files += [ROOT/path for path in ("scripts/check-mobile-customer-photo-copy-native.py","scripts/check-mobile-customer-photo-copy-ui.py","scripts/check-mobile-customer-photo-copy-fixture.py","scripts/lib/mobile_customer_photo_copy_fixture.py")]
    files += [ROOT/path for path in ("scripts/check-mobile-media-delete-native.py","scripts/check-mobile-media-delete-ui.py","scripts/check-mobile-media-delete-fixture.py","scripts/lib/mobile_media_delete_fixture.py")]
    files += [ROOT/path for path in ("scripts/check-mobile-gps-native.py", "scripts/check-mobile-gps-ui.py", "scripts/check-mobile-gps-fixture.py", "scripts/mobile-gps-fixture-server.py", "scripts/lib/mobile_gps_fixture.py")]
    files += [ROOT/path for path in ("scripts/check-mobile-contract-flow-native.py", "scripts/mobile-contract-flow-fixture-server.py", "scripts/lib/mobile_contract_flow_fixture.py", "scripts/lib/mobile_draft_fixture.py")]
    files += [ROOT/path for path in ("scripts/check-mobile-customer-matches-native.py", "scripts/lib/mobile_customer_matches_fixture.py")]
    files += [ROOT/path for path in ("scripts/check-mobile-customer-documents-native.py", "scripts/lib/mobile_customer_documents_fixture.py", "scripts/check-mobile-customer-documents-fixture.py")]
    files += [ROOT/path for path in ("scripts/check-mobile-recovery-native.py", "scripts/mobile-recovery-fixture-server.py",
        "scripts/lib/mobile_bad_debt_recovery_fixture.py", "scripts/lib/mobile_bad_debt_recovery_model.py")]
    files += [ROOT/path for path in ("scripts/check-mobile-media-native.py", "scripts/mobile-media-fixture-server.py", "scripts/lib/mobile_record_media_fixture.py", "scripts/check-mobile-media-fixture.py", "scripts/check-mobile-media-ui.py")]
    files += [path for path in (ROOT/"mobile/plugins").rglob("*") if path.is_file()]
    return {path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(files) if path.is_file()}


def capture(qa, entry_sha, captured_after_run=False):
    sources = source_snapshot()
    package = qa.command("shell", "pm", "path", "vn.himoto.staff").strip()
    if not package.startswith("package:/data/app/") or not package.endswith("/base.apk") or "\n" in package:
        raise AssertionError("Expected exactly one installed Himoto QA base APK")
    installed_sha = qa.command("shell", "sha256sum", package.removeprefix("package:")).split()[0]
    if len(installed_sha) != 64 or any(char not in "0123456789abcdef" for char in installed_sha):
        raise AssertionError("Installed APK checksum unavailable")
    proof = {"capturedAt": datetime.now(timezone.utc).isoformat(), "capturedAfterRun": captured_after_run,
        "prewarmedEntrySha256": entry_sha, "installedApkSha256": installed_sha, "sourceFiles": sources}
    qa.output.joinpath("source-provenance.json").write_text(json.dumps(proof, indent=2)+"\n", encoding="utf-8")
    return sources
