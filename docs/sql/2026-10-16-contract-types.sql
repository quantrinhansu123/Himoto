BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS himoto.management_contract_types (
  id varchar(80) PRIMARY KEY,
  label varchar(80) NOT NULL CHECK (btrim(label) <> ''),
  rental_type varchar(32) NOT NULL CHECK (rental_type IN ('daily','monthly','monthly_3','monthly_6','monthly_12','rental','tour','ownership','ownership_cd')),
  term_months integer CHECK (term_months BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 100,
  created_by bigint REFERENCES himoto.users(id),
  updated_by bigint REFERENCES himoto.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS management_contract_types_label_unique ON himoto.management_contract_types(lower(btrim(label)));
INSERT INTO himoto.management_contract_types(id,label,rental_type,term_months,active,position) VALUES
  ('daily','Thuê theo ngày','daily',NULL,true,0),
  ('monthly','Thuê theo tháng','monthly',NULL,true,1),
  ('ownership','Thuê sở hữu','ownership',NULL,true,2),
  ('monthly_3','Thuê 3 tháng','monthly_3',3,false,10),
  ('monthly_6','Thuê 6 tháng','monthly_6',6,false,11),
  ('monthly_12','Thuê 12 tháng','monthly_12',12,false,12),
  ('rental','Thuê xe','rental',NULL,false,13),
  ('tour','Tour / phượt','tour',NULL,false,14),
  ('ownership_cd','Thuê sở hữu( cd)','ownership_cd',NULL,false,15)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE himoto.management_contract_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON himoto.management_contract_types FROM anon, authenticated;
COMMIT;
