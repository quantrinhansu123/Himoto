import { Stack, type ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "@/providers/session";
import { StateView } from "@/components/ui";
import { useTheme } from "@/theme";
import { EnvironmentBanner } from "@/components/environment-banner";
import { NotificationBridge } from "@/components/notification-bridge";
import { OfflineBanner } from '@/components/offline-banner';
import { BiometricGate } from '@/components/biometric-gate';

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <StateView
        title="Không mở được màn hình"
        message="Vui lòng thử lại để tiếp tục."
        retry={retry}
      />
    </SafeAreaView>
  );
}
function Navigator() {
  const { session, restoring, restoreError, restore } = useSession();
  const theme = useTheme();
  if (restoring || restoreError)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <StatusBar style="auto" />
        <StateView
          title={restoring ? "Đang mở Himoto" : "Chưa thể kết nối"}
          loading={restoring}
          message={restoreError || undefined}
          retry={
            restoreError
              ? () => {
                  void restore();
                }
              : undefined
          }
        />
      </SafeAreaView>
    );
  return (
    <>
      <StatusBar style="auto" />
      <EnvironmentBanner />
      <OfflineBanner />
      <NotificationBridge />
      <SafeAreaProvider style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.text,
          contentStyle: { backgroundColor: theme.background },
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Protected guard={!session}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="attendance" options={{title:'Chấm công'}}/>
          <Stack.Screen name="guide" options={{title:'Hướng dẫn và hỏi đáp'}}/>
          <Stack.Screen name="offline-sync" options={{ title: 'Dữ liệu và đồng bộ' }}/>
          <Stack.Screen name="notifications" options={{title:'Thông báo công việc'}}/>
          <Stack.Screen name="notification-activity" options={{title:'Sự kiện gần đây'}}/>
          <Stack.Screen name="notification-list/[kind]" options={{title:'Công việc cần xử lý'}}/>
          <Stack.Screen name="integrations" options={{ title: "Tích hợp GPS và Telegram" }} />
          <Stack.Screen name="integration-result/[key]" options={{ title: "Xác nhận cấu hình tích hợp" }} />
          <Stack.Screen name="operations" options={{ title: "Thao tác nhanh" }} />
          <Stack.Screen name="operation-contracts/[action]" options={{ title: "Chọn hợp đồng tại quầy" }} />
          <Stack.Screen name="backfill" options={{ title: "Nhập bổ sung giao dịch" }} />
          <Stack.Screen name="backfill-contract" options={{ title: "Nhập bổ sung lịch sử" }} />
          <Stack.Screen name="managed-accounts" options={{ title: "Tài khoản và phân quyền" }} />
          <Stack.Screen name="managed-account/[id]" options={{ title: "Hồ sơ tài khoản" }} />
          <Stack.Screen name="managed-account-editor/[id]" options={{ title: "Tạo / sửa tài khoản" }} />
          <Stack.Screen name="managed-account-result/[key]" options={{ title: "Xác nhận tài khoản" }} />
          <Stack.Screen name="change-password" options={{ title: "Đổi mật khẩu" }} />
          <Stack.Screen name="contract-types" options={{ title: "Loại hợp đồng" }} />
          <Stack.Screen name="contract-type-result/[key]" options={{ title: "Xác nhận loại hợp đồng" }} />
          <Stack.Screen name="battery-contracts" options={{ title: "Hợp đồng pin / sạc" }} />
          <Stack.Screen name="battery/[id]" options={{ title: "Hồ sơ pin / sạc" }} />
          <Stack.Screen name="battery-editor/[id]" options={{ title: "Lập / sửa hợp đồng pin" }} />
          <Stack.Screen name="battery-action/[id]" options={{ title: "Gia hạn / trả pin" }} />
          <Stack.Screen name="battery-result/[key]" options={{ title: "Xác nhận pin / sạc" }} />
          <Stack.Screen name="battery-media/[id]/[eventKey]" options={{ title: "Ảnh và Telegram pin / sạc" }} />
          <Stack.Screen name="shift-reports" options={{ title: "Báo cáo cuối ca" }} />
          <Stack.Screen name="shift/[id]" options={{ title: "Hồ sơ báo cáo ca" }} />
          <Stack.Screen name="shift-video/[id]" options={{ title: "Video minh chứng ca" }} />
          <Stack.Screen name="vehicle-contracts/[id]" options={{title:'Hợp đồng của xe'}} />
          <Stack.Screen name="fleet-inventory" options={{title:'Kho xe toàn hệ thống'}}/>
          <Stack.Screen name="import-contracts" options={{title:'Nhập nháp hợp đồng từ Excel'}} />
          <Stack.Screen name="contract-telegram/[id]" options={{title:'Telegram hợp đồng'}} />
          <Stack.Screen name="transfer-telegram/[id]/[eventId]" options={{title:'Telegram điều chuyển'}} />
          <Stack.Screen name="telegram-result/[key]" options={{title:'Xác nhận yêu cầu Telegram'}} />
          <Stack.Screen name="telegram-pending" options={{title:'Giao dịch chưa gửi Telegram'}} />
          <Stack.Screen name="shift-editor/[id]" options={{ title: "Kiểm kê cuối ca" }} />
          <Stack.Screen name="shift-audit/[id]" options={{ title: "Đối soát KTNB" }} />
          <Stack.Screen name="shift-result/[key]" options={{ title: "Xác nhận báo cáo ca" }} />
          <Stack.Screen name="debt-reminders" options={{ title: "Gửi nhắc nợ" }} />
          <Stack.Screen name="reminder-editor/[id]" options={{ title: "Soạn nhắc nợ" }} />
          <Stack.Screen name="reminder-result/[key]" options={{ title: "Kết quả nhắc nợ" }} />
          <Stack.Screen name="cashbook" options={{ title: "Sổ quỹ / Sổ két" }} />
          <Stack.Screen name="staff-sales" options={{ title: "Báo cáo doanh thu thuê xe" }} />
          <Stack.Screen name="sales-report/[kind]" options={{ title: "Chi tiết báo cáo" }} />
          <Stack.Screen name="cashbook-delete-result/[key]" options={{ title: "Xác nhận xóa phiếu" }} />
          <Stack.Screen name="cashbook-accounts" options={{ title: "Tài khoản ngân hàng / Két" }} />
          <Stack.Screen name="cashbook-account/[kind]/[id]" options={{ title: "Chi tiết tài khoản" }} />
          <Stack.Screen name="cashbook-account-transactions/[kind]/[id]" options={{ title: "Thu chi tài khoản" }} />
          <Stack.Screen name="cashbook-account-editor/[kind]/[id]" options={{ title: "Quản lý tài khoản sổ quỹ" }} />
          <Stack.Screen name="cashbook-account-result/[key]" options={{ title: "Xác nhận tài khoản sổ quỹ" }} />
          <Stack.Screen name="staff/[id]" options={{ title: "Hồ sơ nhân sự" }} />
          <Stack.Screen name="staff-organization" options={{title:'Sơ đồ nhân sự'}}/>
          <Stack.Screen name="dashboard" options={{title:'Tổng quan giao dịch'}}/>
          <Stack.Screen name="bulk-delete/[kind]" options={{title:'Chọn và xóa nhiều hồ sơ'}}/>
          <Stack.Screen name="bulk-delete-result/[key]" options={{title:'Xác nhận xóa hồ sơ'}}/>
          <Stack.Screen name="staff-editor/[id]" options={{ title: "Quản lý nhân sự" }} />
          <Stack.Screen name="staff-result/[key]" options={{ title: "Xác nhận nhân sự" }} />
          <Stack.Screen name="store/[id]" options={{ title: "Thông tin cơ sở" }} />
          <Stack.Screen name="store-editor/[id]" options={{ title: "Quản lý cơ sở" }} />
          <Stack.Screen name="store-result/[key]" options={{ title: "Xác nhận cơ sở" }} />
          <Stack.Screen name="store-records/[id]/[kind]" options={{ title: "Dữ liệu cơ sở" }} />
          <Stack.Screen name="vehicle/[id]" options={{ title: "Hồ sơ xe" }} />
          <Stack.Screen name="vehicle-editor/[id]" options={{ title: "Nhập thông tin xe" }} />
          <Stack.Screen name="vehicle-result/[key]" options={{ title: "Xác nhận lưu xe" }} />
          <Stack.Screen name="vehicle-history/[id]" options={{ title: "Lịch sử xe" }} />
          <Stack.Screen name="vehicle-transfers" options={{ title: "Điều chuyển toàn hệ thống" }} />
          <Stack.Screen name="contracts-workspace/[scope]" options={{ title: "Nhóm hợp đồng" }} />
          <Stack.Screen name="directory/[kind]" options={{ title: "Danh bạ" }} />
          <Stack.Screen name="duty-roster" options={{ title: "Lịch trực" }} />
          <Stack.Screen name="duty-result/[key]" options={{ title: "Xác nhận ca trực" }} />
          {__DEV__&&<Stack.Screen name="contract-work-qa" options={{title:'Kiểm tra bộ nhớ QA'}}/>}
          <Stack.Screen name="gps" options={{title:'Định vị GPS'}} />
          <Stack.Screen name="gps-mapping/[id]" options={{title:'Ghép GPS với xe'}} />
          <Stack.Screen name="finance/[id]" options={{ title: "Thu/chi hợp đồng" }} />
          <Stack.Screen name="payment/[id]" options={{ title: "Ghi nhận thu/chi" }} />
          <Stack.Screen name="renewal-payment/[id]" options={{ title: "Thu theo kỳ gia hạn" }} />
          <Stack.Screen name="collection-bill/[id]" options={{ title: "Bill khoản thu theo kỳ" }} />
          <Stack.Screen name="renewal-periods/[id]" options={{ title: "Các kỳ gia hạn đã lưu" }} />
          <Stack.Screen name="renewal-bill/[id]" options={{ title: "Bill gia hạn" }} />
          <Stack.Screen name="renewal/[id]" options={{ title: "Gia hạn hợp đồng" }} />
          <Stack.Screen name="return/[id]" options={{ title: "Phiếu trả xe" }} />
          <Stack.Screen name="swap/[id]" options={{ title: "Phiếu đổi xe" }} />
          <Stack.Screen name="recovery/[id]" options={{ title: "Phiếu thu hồi xe" }} />
          <Stack.Screen name="recovery-editor/[id]" options={{ title: "Thu hồi xe nợ xấu" }} />
          <Stack.Screen name="vehicle-transfer/[id]" options={{ title: "Phiếu điều chuyển" }} />
          <Stack.Screen name="media-receipt/[entity]/[id]" options={{ title: "Phiếu lưu ảnh" }} />
          <Stack.Screen name="record-video/[id]" options={{ title: "Video hồ sơ" }} />
          <Stack.Screen name="video-receipt/[id]" options={{ title: "Phiếu lưu video" }} />
          <Stack.Screen name="media-delete/[entity]/[id]" options={{ title: "Xóa tệp hồ sơ" }} />
          <Stack.Screen name="customer-photo-copy/[id]" options={{ title: "Giấy tờ khách trên hợp đồng" }} />
          <Stack.Screen name="record-media/[entity]/[id]" options={{ title: "Ảnh hồ sơ" }} />
          <Stack.Screen name="vehicle-transfer-editor/[id]" options={{ title: "Điều chuyển và nhận xe" }} />
          <Stack.Screen name="vehicle-status-editor/[id]" options={{ title: "Đổi trạng thái xe" }} />
          <Stack.Screen name="vehicle-status-result/[key]" options={{ title: "Kết quả đổi trạng thái" }} />
          <Stack.Screen name="swap-editor/[id]" options={{ title: "Đổi xe trong hợp đồng" }} />
          <Stack.Screen name="return-editor/[id]" options={{ title: "Trả xe và quyết toán" }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="customer/new"
            options={{ title: "Thêm khách hàng" }}
          />
          <Stack.Screen name="draft-work/[id]" options={{title:"Bản đang soạn"}}/>
          <Stack.Screen name="draft-work-media/[id]" options={{title:"Hoàn tất hồ sơ đã lưu"}}/>
          <Stack.Screen name="draft/new" options={{ title: "Thêm bản nháp" }} />
          <Stack.Screen
            name="contract/[id]"
            options={{ title: "Rà soát hợp đồng" }}
          />
          <Stack.Screen
            name="draft/[id]"
            options={{ title: "Soạn hợp đồng" }}
          />
          <Stack.Screen
            name="customer/[id]"
            options={{ title: "Sửa khách hàng" }}
          />
          <Stack.Screen
            name="record/[kind]/[id]"
            options={{ title: "Chi tiết hồ sơ" }}
          />
        </Stack.Protected>
      </Stack>
      </SafeAreaProvider>
    </>
  );
}
export default function RootLayout() {
  useEffect(() => {
    // The mounted shell already has loading/error UI. Release the native
    // pre-draw splash gate even when an older Android stalls Router's RAF.
    SplashScreen.hide();
  }, []);
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <BiometricGate><Navigator /></BiometricGate>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
