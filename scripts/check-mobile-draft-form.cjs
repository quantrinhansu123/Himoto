const assert = require("node:assert/strict"),
  path = require("node:path");
const { load, root } = require("./lib/load-typescript.cjs");
const form = load(path.resolve(root, "../mobile/src/lib/draft-form"));
const template = require("./fixtures/mobile-draft.json");
const copy = (value) => JSON.parse(JSON.stringify(value));
const options = {
  initial: copy(template),
  stores: [{ id: 23, name: "QA" }],
  vehicleStores: [{ id: 23, name: "QA" }],
  types: [
    {
      id: "daily",
      label: "Ngày",
      rentalType: "daily",
      termMonths: null,
      active: true,
    },
    {
      id: "monthly_3",
      label: "Ba tháng",
      rentalType: "monthly_3",
      termMonths: 3,
      active: false,
    },
  ],
};
const checks = [];
const structured = global.structuredClone;
try {
  global.structuredClone = undefined;
  const input = form.newDraftInput(options);
  assert.equal(form.errorDraftStep({ start_date: "Invalid date" }), 2);
  assert.equal(form.errorDraftStep({ signed_on: "Invalid date" }), 0);
  assert.equal(form.errorDraftStep({ authorization_date: "Invalid date" }), 4);
  assert.equal(input.draft.contract_type_id, "daily");
  assert(!template.draft.contract_type_id);
  assert.notEqual(input, options.initial);
  checks.push(
    "New drafts use active configured types and copy JSON data without requiring a native structuredClone global",
  );

  const legacy = copy(template);
  legacy.rental_type = "monthly_3";
  legacy.draft.contract_type_name = "Tên đã ký";
  legacy.draft.total_amount = "9000000";
  legacy.draft.custom_installments = [
    { due_at: "2026-11-01T08:00", amount: "3000000" },
  ];
  legacy.draft.extra_charges = [
    { name: "QA", amount: "100000", method: "cash" },
  ];
  const before = copy(legacy);
  const restored = form.restoreDraftType(legacy, options);
  assert.equal(restored.draft.contract_type_id, "monthly_3");
  assert.equal(restored.draft.contract_type_name, "Tên đã ký");
  assert.deepEqual(
    restored.draft.custom_installments,
    before.draft.custom_installments,
  );
  assert.deepEqual(restored.draft.extra_charges, before.draft.extra_charges);
  assert.equal(restored.draft.total_amount, "9000000");
  assert.deepEqual(legacy, before);
  checks.push(
    "Legacy drafts restore their original hidden type without changing amounts, charges, installment schedules or the original snapshot",
  );

  const party = copy(input);
  Object.assign(party.draft.customer, {
    name: "Old customer",
    driver_license_number: "OLD-LICENCE",
    driver_license_issued_on: "2020-01-01",
  });
  party.draft.vehicles = [
    {
      ...form.emptyDraftVehicle(),
      id: "301",
      driver_name: "Old customer",
      driver_license_number: "OLD-LICENCE",
      driver_license_issued_on: "2020-01-01",
    },
    {
      ...form.emptyDraftVehicle(),
      id: "302",
      driver_name: "Manual driver",
      driver_license_number: "OLD-LICENCE",
      driver_license_issued_on: "2020-01-01",
    },
  ];
  const customer = {
    id: 91,
    storeId: 23,
    storeName: "QA",
    status: "active",
    details: {
      ...party.draft.customer,
      name: "New customer",
      driver_license_number: "NEW-LICENCE",
      driver_license_issued_on: "2022-02-02",
    },
    relatives: copy(party.draft.relatives),
  };
  const switched = form.chooseDraftCustomer(party, customer);
  assert.equal(switched.draft.vehicles[0].driver_name, "New customer");
  assert.equal(switched.draft.vehicles[0].driver_license_number, "NEW-LICENCE");
  assert.deepEqual(switched.draft.vehicles[1], party.draft.vehicles[1]);
  checks.push(
    "Changing customers updates default driver identities as a unit and preserves every field of an explicitly edited driver",
  );

  const draft = copy(input);
  draft.draft.customer = customer.details;
  draft.draft.vehicles = [
    {
      ...form.emptyDraftVehicle(),
      driver_name: "Manual driver",
      borrow_hats: "5",
      rent_at: "2026-11-01T10:00",
    },
  ];
  const selected = form.addDraftVehicle(draft, {
    ...form.emptyDraftVehicle(),
    id: "303",
    name: "QA bike",
    license: "QA-303",
  });
  assert.equal(selected.draft.vehicles.length, 1);
  assert.equal(selected.draft.vehicles[0].borrow_hats, "5");
  assert.equal(selected.draft.vehicles[0].driver_name, "Manual driver");
  assert.equal(selected.draft.vehicles[0].driver_license_number, "");
  assert.equal(selected.draft.vehicles[0].rent_at, "2026-11-01T10:00");
  assert.throws(() =>
    form.addDraftVehicle(selected, { ...form.emptyDraftVehicle(), id: "303" }),
  );
  checks.push(
    "Selecting stock fills a placeholder while preserving entered equipment, explicit drivers and line times; duplicate stock is rejected",
  );

  const dated = copy(input);
  dated.draft.vehicles = [
    { ...form.emptyDraftVehicle(), return_at: dated.draft.end_date },
    { ...form.emptyDraftVehicle(), return_at: "2026-11-10T09:00" },
  ];
  const changed = form.changeDraftTime(dated, "end_date", "2026-11-03T08:00");
  assert.equal(changed.draft.vehicles[0].return_at, "2026-11-03T08:00");
  assert.equal(changed.draft.vehicles[1].return_at, "2026-11-10T09:00");
  changed.draft.total_amount = "1x";
  assert.equal(form.errorDraftStep(form.draftErrors(changed)), 3);
  assert.equal(changed.draft.total_amount, "1x");
  changed.draft.total_amount = "";
  changed.draft.start_date = "0000-01-01T08:00";
  assert(form.draftErrors(changed).start_date);
  checks.push(
    "Date edits preserve per-line overrides; malformed dates/money select the correct step and never erase entered values",
  );
  console.log(
    JSON.stringify(
      { passed: checks.length, checks, operationalWrites: 0 },
      null,
      2,
    ),
  );
} finally {
  global.structuredClone = structured;
}
