import React, { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Camera, Film, RefreshCw, Trash2 } from "lucide-react-native";
import { useSession } from "@/providers/session";
import { dateTime, useTheme } from "@/theme";
import { BillPhoto } from "./bill-photo";
import { Button, Card, InlineError, SkeletonList, StatusBadge } from "./ui";

export function ContractPhotosTab({ id }: { id: string }) {
  const { api, session } = useSession();
  const theme = useTheme();
  const [historyMode, setHistoryMode] = useState(false);

  const scope = [session?.user.id, session?.user.storeId, session?.user.allStores];

  const targetsQuery = useQuery({
    queryKey: ["contract-photos-tab", "targets", ...scope, id, historyMode],
    queryFn: ({ signal }) =>
      historyMode
        ? api!.mediaHistoryTargets(id, 1, signal)
        : api!.mediaTargets("contracts", id, 1, signal),
    enabled: !!api,
    staleTime: 15_000,
    retry: false,
  });

  const targetRows = targetsQuery.data?.rows ?? [];

  const galleryQueries = useQueries({
    queries: targetRows.map((target) => ({
      queryKey: [
        "contract-photos-tab",
        "gallery",
        ...scope,
        target.entity,
        target.id,
        target.kind,
        target.referenceId,
      ],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api!.recordMedia(target, 1, signal),
      enabled: !!api,
      staleTime: 15_000,
      retry: false,
    })),
  });

  const isRefreshing =
    targetsQuery.isFetching || galleryQueries.some((q) => q.isFetching);

  function refreshAll() {
    void targetsQuery.refetch();
    for (const q of galleryQueries) {
      void q.refetch();
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 10 }}>
        <Text style={{ color: theme.text, fontSize: 15.5, fontWeight: "800" }}>
          Ảnh thuê / trả xe
        </Text>
        <Text style={{ color: theme.muted, fontSize: 13.5, lineHeight: 20 }}>
          Ảnh và video được lưu riêng theo lúc thuê, giao xe, biển số và từng lượt trả / đổi xe. Chạm vào ảnh để phóng to hoặc dùng nút Xóa dưới từng tệp.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Button
            size="sm"
            secondary
            loading={isRefreshing}
            icon={<RefreshCw size={14} color={theme.text} />}
            label="Làm mới ảnh"
            onPress={refreshAll}
          />
          <Button
            size="sm"
            secondary
            label={
              historyMode
                ? "Ảnh lập, giao, trả & đổi xe"
                : "Gia hạn, phiếu & đổi pin"
            }
            onPress={() => setHistoryMode((v) => !v)}
          />
          {!historyMode && (
            <Button
              size="sm"
              secondary
              label="Lấy giấy tờ từ hồ sơ khách"
              onPress={() =>
                router.push({
                  pathname: "/customer-photo-copy/[id]",
                  params: { id },
                })
              }
            />
          )}
        </View>
      </Card>

      {targetsQuery.isError && (
        <InlineError message={targetsQuery.error.message} />
      )}

      {targetsQuery.isPending && <SkeletonList count={2} lines={3} />}

      {!targetsQuery.isPending && !targetsQuery.isError && targetRows.length === 0 && (
        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.muted, fontSize: 14, lineHeight: 20 }}>
            {historyMode
              ? "Chưa có mục ảnh / video cho gia hạn, phiếu thu hoặc đổi pin."
              : "Chưa có mục ảnh nào cho hợp đồng này."}
          </Text>
          <Button
            size="sm"
            secondary
            icon={<Camera size={14} color={theme.text} />}
            label="Mở trình tải ảnh hồ sơ"
            onPress={() =>
              router.push({
                pathname: "/record-media/[entity]/[id]",
                params: { entity: "contracts", id },
              })
            }
          />
        </Card>
      )}

      {targetRows.map((target, index) => {
        const galleryQuery = galleryQueries[index];
        const gallery = galleryQuery?.data;
        const photos = gallery?.rows ?? [];
        const openUpload = () =>
          router.push({
            pathname: "/record-media/[entity]/[id]",
            params: {
              entity: "contracts",
              id,
              kind: target.kind,
              referenceId: String(target.referenceId),
            },
          });

        return (
          <Card
            key={`${target.kind}:${target.referenceId}`}
            style={{ gap: 10 }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text
                style={{
                  color: theme.text,
                  fontSize: 15.5,
                  fontWeight: "800",
                  flex: 1,
                }}
              >
                {target.label}
              </Text>
              <StatusBadge
                status={photos.length > 0 ? "completed" : "pending"}
                label={
                  galleryQuery?.isPending
                    ? "Đang tải…"
                    : `${photos.length} tệp`
                }
              />
            </View>

            {galleryQuery?.isError && (
              <InlineError message={galleryQuery.error.message} />
            )}

            {galleryQuery?.isPending && (
              <Text style={{ color: theme.muted, fontSize: 13.5 }}>
                Đang tải ảnh đã lưu…
              </Text>
            )}

            {!galleryQuery?.isPending && !galleryQuery?.isError && photos.length === 0 && (
              <Text style={{ color: theme.muted, fontSize: 13.5 }}>
                Chưa có ảnh / video đã lưu cho mục này.
              </Text>
            )}

            {gallery &&
              photos.map((photo) => (
                <View
                  key={photo.slot}
                  style={{
                    gap: 8,
                    borderTopWidth: 1,
                    borderTopColor: theme.border,
                    paddingTop: 10,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.text,
                        fontSize: 14.5,
                        fontWeight: "700",
                        flex: 1,
                      }}
                    >
                      {photo.label}
                    </Text>
                    <Text style={{ color: theme.muted, fontSize: 12 }}>
                      {dateTime(photo.updatedAt)}
                      {photo.kind === "video"
                        ? " · Video"
                        : photo.bytes
                          ? ` · ${Math.ceil(photo.bytes / 1024)} KB`
                          : ""}
                    </Text>
                  </View>

                  {!!photo.blockedReason && (
                    <Text style={{ color: theme.muted, fontSize: 13 }}>
                      {photo.blockedReason}
                    </Text>
                  )}

                  {photo.readable && photo.kind === "image" && api && (
                    <BillPhoto
                      context="hồ sơ"
                      previewSource={api.recordMediaImageSource(
                        gallery.target,
                        photo,
                        true,
                      )}
                      source={api.recordMediaImageSource(gallery.target, photo)}
                      label={photo.label}
                    />
                  )}

                  {photo.kind === "video" && (
                    <Button
                      size="sm"
                      secondary
                      icon={<Film size={14} color={theme.text} />}
                      label={`Xem / quản lý video · ${photo.label}`}
                      onPress={() =>
                        router.push({
                          pathname: "/record-video/[id]",
                          params: {
                            id,
                            kind: target.kind,
                            referenceId: String(target.referenceId),
                            slot: photo.slot,
                          },
                        })
                      }
                    />
                  )}

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Button
                      size="sm"
                      equalWidth
                      secondary
                      danger
                      icon={<Trash2 size={14} color={theme.danger} />}
                      label="Xóa tệp"
                      onPress={() =>
                        router.push({
                          pathname: "/media-delete/[entity]/[id]",
                          params: {
                            entity: "contracts",
                            id,
                            kind: target.kind,
                            referenceId: String(target.referenceId),
                            slot: photo.slot,
                          },
                        })
                      }
                    />
                  </View>
                </View>
              ))}

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                paddingTop: 4,
              }}
            >
              <Button
                size="sm"
                secondary
                icon={<Camera size={14} color={theme.text} />}
                label="Thêm / chụp ảnh & video"
                onPress={openUpload}
              />
              {gallery?.hasMore && (
                <Button
                  size="sm"
                  secondary
                  label="Xem tất cả ảnh mục này"
                  onPress={openUpload}
                />
              )}
            </View>
          </Card>
        );
      })}
    </View>
  );
}
