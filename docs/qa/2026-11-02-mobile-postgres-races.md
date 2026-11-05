# Media — tranh chấp nhiều phiên PostgreSQL thật

Mục tiêu app vẫn active, chưa nghiệm thu toàn app. Lượt cuối
`.backups/mobile-media-postgres-20261102-run4/` đạt **9 nhóm**, PostgreSQL17.11
native Windows. Hai backend PID khác nhau thực thi actual server media writer,
resolver, shared photo domain và `scopedConnect`. Bảy lần chờ khóa được kiểm bằng
`pg_blocking_pids`, không suy từ thời gian chờ hoặc mô hình khóa JavaScript.
285 file source/input khớp trong lượt;0 production/operational writes.

## Phạm vi đã kiểm

- Cùng actor/UUID đồng thời: một ảnh/proof, lượt retry nhận phiếu gốc.
- Hai UUID thay cùng ô ảnh: cả contract line và vehicle event thực sự chờ parent
  lock; lượt đến sau bị stale photo revision, rollback cả request của nó.
- Cancel chưa commit giữ khóa unique; ảnh đến muộn chờ rồi bị tombstone chặn.
- Resolver chờ writer commit và trả kết quả committed gốc, không tạo hủy nhầm.
- Writer lỗi sau thay ảnh, trước proof: rollback ảnh/request; resolver đang chờ
  tạo tombstone, mọi retry key cũ bị chặn.
- Cùng UUID nhưng bytes khác: conflict sau unique wait, ảnh/proof đầu giữ nguyên.
- Hai actor/cơ sở giữ transaction độc lập cùng UUID; actor-bound RLS tách phiếu,
  đổi cơ sở hoặc mất quyền hợp đồng chặn resolve. Quyền ảnh theo shared web,
  không tự yêu cầu quyền tài chính.
- Cả hai pool connection đã dùng trả sạch role, actor, store, all-stores,
  operation và pinned vehicle khi transaction kết thúc.

## Môi trường và bảo toàn

Cluster riêng `himoto-mobile-local-qa`, chỉ listen127.0.0.1:55439, PID6908 ở mốc
này; dữ liệu `.backups/mobile-postgres-local-qa-20261102/pgdata`. Không cài OS
service. Guard transport chỉ mở literal loopback/cổng QA, kiểm cluster sentinel
trước CREATE DATABASE, không đọc connection URL từ env. Core HTTP/HTTPS/TLS/
fetch/socket guard vẫn chặn kết nối khác; chỉ socket của driver QA được ngoại lệ
đúng host/cổng. Backend dùng global QA pool trước lazy credential resolution;
không đọc/copy/log `.env.local`.

Mỗi lần chạy tạo database `himoto_media_races_<timestamp>` mới, giữ mọi database
cũ; không drop/reset/clean dữ liệu để chạy lại. Exact database/version/PID/waits
và hashes trong `results.json`, `database.json`. Có custom-format dump của QA DB
trong output cuối; đây chỉ là dữ liệu tổng hợp, không phải sao lưu production.
Native journal8099 và checkpoint điều chuyển/thu hồi không tham gia các test này.

PostgreSQL portable lấy từ [EDB binaries](https://www.enterprisedb.com/download-postgresql-binaries),
được [PostgreSQL Windows downloads](https://www.postgresql.org/download/windows/)
liên kết. Tool/ZIP trong `.backups/tools/postgresql-17.11-qa/`, manifest ghi URL,
size và SHA256 tải về; chỉ extract bin/lib/share, không installer hay pgAdmin.
Docker Desktop trước đó không lên init control API sau hơn9 phút; đã dừng instance
vừa mở bằng CLI force stop. Không sửa WSL, không tạo image/container/DB Docker.

Chạy lại khi đúng QA cluster đang hoạt động, dùng output chưa tồn tại:

    npm.cmd run test:mobile:postgres -- --output .backups/mobile-media-postgres-next

Harness: `scripts/check-mobile-media-postgres.cjs`, transport
`scripts/lib/mobile_postgres_qa.cjs`. Run1 fail guard vì inet::text có suffix/32,
0 nhóm/không tạo schema nghiệp vụ; giữ log/failure. Đã dùng `host(inet_server_addr())`
và đóng admin connection trong finally. Run2 đạt8 nhóm, run3 thêm pool cleanup
đạt9; run4 kiểm cả pinned vehicle cleanup, đạt9. Giữ toàn bộ artifact và DB cũ.

## Giới hạn

Đây là minimal synthetic branch RLS fixture với hai migration request/proof thật;
không phải bản sao production schema hay deployed ownership/HQ policies. Chưa
chứng nhận concurrency cho mọi writer tài chính/trả–đổi–thu hồi/điều chuyển,
staging performance, native app kết nối backend triển khai, hoặc iPhone/release.
Bộ PGlite124 nhóm riêng kiểm actual shared domain/ownership/HQ/RLS với một kết
nối; hai loại bằng chứng bổ sung cho nhau, không cộng thành tỷ lệ hoàn thiện app.
