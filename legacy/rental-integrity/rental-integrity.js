/* Small Vue 2 add-on for the existing legacy bundle. No business writes. */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else api.boot(root);
}(typeof window === 'undefined' ? this : window, function () {
    'use strict';
    function csvCell(value) {
        var text = String(value == null ? '' : value);
        if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
    }
    function csv(data) {
        var rows = [['Biển số', 'Tên xe', 'Cơ sở app cũ', 'Tình trạng cơ sở', 'Cảnh báo app cũ', 'Đối chiếu app mới', 'Kiểm tra app mới (giờ Việt Nam)', 'Kiểm tra app cũ (giờ Việt Nam)']];
        data.rows.forEach(function (row) { rows.push([row.license, row.name, row.store_name, row.store_status === 'opening' ? 'Đang hoạt động' : 'Đã đóng', row.local_issue, row.message, time(row.new_checked_at), time(data.checked_at)]); });
        return '\uFEFF' + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
    }
    function time(value) {
        return value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa đối chiếu được';
    }
    function day(value) {
        var values = {};
        new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value)).forEach(function (part) { values[part.type] = part.value; });
        return values.year + '-' + values.month + '-' + values.day;
    }
    function component(parent) {
        return {
            name: 'HimotoRentalIntegrity',
            data: function () { return { loading: false, record: null, error: '', closed: false, request: 0 }; },
            computed: { admin: function () { return Number(parent.$store.getters.currentUser.role_id) === 1; } },
            mounted: function () {
                var self = this;
                this.stopScope = parent.$watch(function () { return String(parent.query && parent.query.store_id || ''); }, function () { self.reload(); });
                this.reload();
            },
            beforeDestroy: function () { this.request++; if (this.stopScope) this.stopScope(); },
            methods: {
                reload: function () {
                    var self = this, current = ++this.request;
                    this.loading = true; this.error = ''; this.record = null;
                    var store = parent.query && parent.query.store_id;
                    var params = { include_closed: this.closed && this.admin ? '1' : '0' };
                    if (store) params.store_id = store;
                    parent.$options._base.axios.get('/api/auth/vehicle/rental-integrity', { params: params, timeout: 16000 }).then(function (response) {
                        if (current !== self.request) return;
                        var payload = response.data;
                        if (!payload || payload.status !== 'success' || !payload.data || !Array.isArray(payload.data.rows)) throw new Error('invalid');
                        self.record = payload.data;
                    }).catch(function () {
                        if (current === self.request) self.error = 'Không tải được cảnh báo xe. Bấm Làm mới cảnh báo để thử lại.';
                    }).finally(function () { if (current === self.request) self.loading = false; });
                },
                download: function () {
                    if (!this.record || this.loading || this.error) return;
                    var url = URL.createObjectURL(new Blob([csv(this.record)], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a');
                    link.href = url; link.download = 'canh-bao-xe-app-cu-' + day(this.record.checked_at) + '.csv';
                    document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
                }
            },
            render: function (h) {
                var self = this, data = this.record;
                var buttons = [h('button', { class: 'btn btn-sm btn-light-primary', attrs: { type: 'button', disabled: this.loading }, on: { click: this.reload } }, 'Làm mới cảnh báo'),
                    h('button', { class: 'btn btn-sm btn-light-primary', attrs: { type: 'button', disabled: !data || this.loading || !!this.error }, on: { click: this.download } }, 'Xuất cảnh báo CSV')];
                var content = [h('div', { class: 'himoto-integrity-heading' }, [h('strong', 'Cảnh báo xe Đang thuê · Đối chiếu hợp đồng'), h('div', { class: 'himoto-integrity-actions' }, buttons)]),
                    h('p', 'Kiểm tra toàn bộ xe Đang thuê tại cơ sở đang chọn, không phụ thuộc trang danh sách. Xác nhận xe ở kho hay ở khách trước khi sửa hồ sơ.')];
                if (this.admin) content.push(h('label', { class: 'himoto-integrity-closed' }, [h('input', { attrs: { type: 'checkbox', disabled: this.loading }, domProps: { checked: this.closed }, on: { change: function (e) { self.closed = e.target.checked; self.reload(); } } }), ' Bao gồm cơ sở đã đóng']));
                if (this.loading) content.push(h('p', { attrs: { role: 'status' } }, 'Đang kiểm tra hợp đồng trên hai app…'));
                if (this.error) content.push(h('p', { class: 'himoto-integrity-error', attrs: { role: 'alert' } }, this.error));
                if (data && !this.loading && !this.error) {
                    var warnings = data.rows.filter(function (r) { return r.level === 'warning'; }).length;
                    var infos = data.rows.filter(function (r) { return r.level === 'info'; }).length;
                    var unknowns = data.rows.filter(function (r) { return r.level === 'unknown'; }).length;
                    var reviews = data.rows.filter(function (r) { return r.level === 'review'; }).length;
                    content.push(h('p', { attrs: { role: 'status' } }, 'Đã kiểm tra ' + data.checked_count + ' xe · ' + warnings + ' cần xác minh hợp đồng · ' + infos + ' đã có HĐ trên app mới · ' + reviews + ' cần rà hồ sơ · ' + unknowns + ' chưa đối chiếu được'));
                    if (!data.comparison_available) content.push(h('p', { class: 'himoto-integrity-error', attrs: { role: 'alert' } }, 'Kết nối app mới chưa hoàn tất. Chưa thể kết luận các xe chưa đối chiếu là thiếu hợp đồng.'));
                    if (!data.rows.length) content.push(h('p', 'Các xe Đang thuê trong phạm vi kiểm tra đều có hợp đồng và tên khách trên app cũ.'));
                    else content.push(h('div', { class: 'himoto-integrity-rows' }, data.rows.map(function (row) {
                        return h('article', { key: row.id, class: 'himoto-integrity-row himoto-integrity-' + row.level }, [h('strong', row.license + ' · ' + row.name),
                            h('p', row.store_name + (row.store_status === 'opening' ? '' : ' · Cơ sở đã đóng')), h('p', row.local_issue),
                            h('p', { class: 'himoto-integrity-message' }, row.message), h('small', 'Đối chiếu app mới: ' + time(row.new_checked_at)),
                            h('a', { attrs: { href: 'https://himoto.vercel.app/vehicles?search=' + encodeURIComponent(row.license), target: '_blank', rel: 'noopener noreferrer' } }, 'Mở danh sách xe trên app mới')]);
                    })));
                    content.push(h('small', 'Kiểm tra app cũ: ' + time(data.checked_at) + ' (giờ Việt Nam). Kết quả app mới có thể được lưu tối đa 60 giây.'));
                }
                return h('section', { class: 'himoto-integrity', attrs: { 'aria-label': 'Cảnh báo xe Đang thuê thiếu hợp đồng' } }, content);
            }
        };
    }
    function attach(vm) {
        if (!vm || vm.$options.name !== 'VehicleIndex' || vm.__himotoIntegrity || !vm.$el || !vm.$store) return;
        var Vue = vm.$options._base;
        if (!Vue || !Vue.axios) return;
        var panel = new (Vue.extend(component(vm)))({ parent: vm });
        vm.__himotoIntegrity = panel; panel.$mount(); vm.$el.insertBefore(panel.$el, vm.$el.firstChild);
        vm.$once('hook:beforeDestroy', function () { panel.$destroy(); if (panel.$el.parentNode) panel.$el.parentNode.removeChild(panel.$el); });
    }
    function walk(vm) { if (!vm) return; attach(vm); (vm.$children || []).slice().forEach(walk); }
    function boot(window) {
        var attempts = 0, timer = window.setInterval(function () {
            var el = window.document.getElementById('app'), vm = el && el.__vue__;
            // The compiled App component may replace #app with a differently named root.
            if (!vm) {
                var nodes = window.document.querySelectorAll('body > *');
                for (var i = 0; i < nodes.length && !vm; i++) vm = nodes[i].__vue__;
            }
            if (vm && vm.$root) vm = vm.$root;
            if (!vm) { if (++attempts > 120) window.clearInterval(timer); return; }
            window.clearInterval(timer); var Vue = vm.$options._base;
            Vue.mixin({ mounted: function () { attach(this); } }); walk(vm);
        }, 250);
    }
    return { csv: csv, day: day, component: component, attach: attach, boot: boot };
}));
