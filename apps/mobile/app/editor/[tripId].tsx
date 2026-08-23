import * as React from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ExpoClipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Position } from "@roam/core";
import { BRAND } from "@/lib/theme";
import { tripDb } from "@/services/db";
import { api, API_BASE_URL } from "@/lib/env";
import { resolveKeepLocal, resolveTakeRemote } from "@/services/sync";
import { useSyncStore } from "@/store/useSyncStore";
import { useTripStore } from "@/store/useTripStore";
import { TripMap } from "@/map/TripMap";
import { SearchPanel } from "@/features/editor/SearchPanel";
import { DayEditModal } from "@/features/editor/DayEditModal";
import { ModeBar } from "@/features/editor/ModeBar";

const STATUS_LABEL: Record<string, string> = {
  idle: "",
  dirty: "待同步",
  saving: "同步中…",
  saved: "已保存",
  error: "同步失败",
  offline: "离线",
  conflict: "版本冲突",
};

/** 编辑器：地图 + 行程面板。工具：选择 / 加景点 / 搜索。 */
export default function EditorScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const store = useTripStore();
  const trip = store.trip;
  const [panelStop, setPanelStop] = React.useState<string | null>(null);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [dayEdit, setDayEdit] = React.useState<string | null>(null);
  const hasConflict = useSyncStore((s) => (tripId ? s.conflictIds.includes(tripId) : false));

  React.useEffect(() => {
    if (!tripId) return;
    void tripDb.get(tripId).then((t) => {
      if (t) store.load(t);
      else router.replace("/");
    });
    return () => {
      void store.flushNow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const activeDayId = trip ? (store.activeDayId ?? trip.data.days[0]?.id ?? null) : null;

  const stopsOfActiveDay = React.useMemo(() => {
    if (!trip || !activeDayId) return [];
    return trip.data.stops.filter((s) => s.dayId === activeDayId).sort((a, b) => a.order - b.order);
  }, [trip, activeDayId]);

  const stopOrder = React.useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const day of trip?.data.days ?? []) {
      for (const s of [...(trip?.data.stops ?? [])].sort((a, b) => a.order - b.order)) {
        if (s.dayId === day.id) map.set(s.id, ++n);
      }
    }
    return map;
  }, [trip]);

  const initialCenter = React.useMemo<Position>(() => {
    const first = trip?.data.stops[0];
    return first ? [first.lng, first.lat] : [116.397428, 39.90923];
  }, [trip]);

  if (!trip) {
    return (
      <View style={styles.loading}>
        <Text style={{ color: BRAND.inkSoft }}>加载中…</Text>
      </View>
    );
  }

  const handleTap = (latlng: Position) => {
    if (store.tool === "add") {
      const stopId = store.addStopAt({ name: "", lat: latlng[1], lng: latlng[0] });
      if (stopId) {
        void api()
          .regeocode(latlng[1], latlng[0])
          .then((r) => {
            if (r.name) store.setStopName(stopId, r.name);
          })
          .catch(() => {});
      }
    } else {
      // 选择工具下点空白处：取消选中
      store.selectSeg(null);
      store.selectStop(null);
    }
  };

  const onSearchSelect = (hit: { name: string; lat: number; lng: number }) => {
    setSearchOpen(false);
    store.addStopAt({ name: hit.name, lat: hit.lat, lng: hit.lng });
  };

  const onShare = () => {
    if (!trip.shareId) {
      Alert.alert("尚未同步", "行程同步到服务端后才能分享");
      void store.flushNow();
      return;
    }
    const url = `${API_BASE_URL}/t/${trip.shareId}`;
    void ExpoClipboard.setStringAsync(url);
    Alert.alert("链接已复制", url);
  };

  const selectedSeg = store.selectedSegId
    ? trip.data.segments.find((s) => s.id === store.selectedSegId)
    : null;

  const statusLabel = STATUS_LABEL[store.status] ?? "";
  const dayBeingEdited = trip.data.days.find((d) => d.id === dayEdit) ?? null;

  const onConflictKeepLocal = () => {
    void resolveKeepLocal(trip.id).then(() => {
      void tripDb.get(trip.id).then((t) => t && store.load(t));
    });
  };
  const onConflictTakeRemote = () => {
    void resolveTakeRemote(trip.id).then((fresh) => {
      if (fresh) store.load(fresh);
      else store.flushNow();
    });
  };

  return (
    <View style={styles.container}>
      {hasConflict ? (
        <View style={styles.conflictBar}>
          <Text style={styles.conflictText}>云端有其他设备修改了此行程</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable style={styles.conflictBtn} onPress={onConflictKeepLocal}>
              <Text style={[styles.conflictBtnText, { color: BRAND.primary }]}>用我的版本</Text>
            </Pressable>
            <Pressable style={styles.conflictBtn} onPress={onConflictTakeRemote}>
              <Text style={[styles.conflictBtnText, { color: "#b91c1c" }]}>用云端版本</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <View style={styles.titleRow}>
        <TextInput
          style={styles.titleInput}
          value={trip.title ?? ""}
          placeholder="未命名行程"
          placeholderTextColor={BRAND.inkSoft}
          onChangeText={(v) => store.setTitle(v)}
        />
        <Pressable onPress={onShare} hitSlop={6}>
          <Text style={styles.shareBtn}>分享</Text>
        </Pressable>
        {statusLabel ? <Text style={styles.statusChip}>{statusLabel}</Text> : null}
      </View>

      <View style={styles.mapWrap}>
        <TripMap
          stops={trip.data.stops}
          segments={trip.data.segments}
          stopOrder={stopOrder}
          selectedStopId={store.selectedStopId}
          selectedSegId={store.selectedSegId}
          gestureLocked={false}
          initialCenter={initialCenter}
          initialZoom={12}
          onTap={handleTap}
          onStopPress={(id) => setPanelStop(id)}
          onSegmentPress={(id) => store.selectSeg(id)}
        />
        <View style={styles.toolBar}>
          <ToolButton label="选择" active={store.tool === "select"} onPress={() => store.setTool("select")} />
          <ToolButton label="加景点" active={store.tool === "add"} onPress={() => store.setTool("add")} />
          <ToolButton label="搜索" onPress={() => setSearchOpen(true)} />
          <View style={{ flex: 1 }} />
          <ToolButton label="↶" disabled={!store.canUndo} onPress={() => store.undo()} />
          <ToolButton label="↷" disabled={!store.canRedo} onPress={() => store.redo()} />
        </View>
        {searchOpen ? (
          <SearchPanel onSelect={onSearchSelect} onClose={() => setSearchOpen(false)} />
        ) : null}
      </View>

      <View style={styles.panel}>
        {selectedSeg ? (
          <ModeBar
            mode={selectedSeg.mode}
            degraded={Boolean(selectedSeg.degraded)}
            segState={store.segState[selectedSeg.id]}
            onMode={(m) => store.setMode(selectedSeg.id, m)}
            onRetry={() => store.retrySegment(selectedSeg.id)}
          />
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayTabs}>
          {(trip.data.days.length > 0 ? trip.data.days : [{ id: "d1", name: "第 1 天" }]).map((day) => (
            <Pressable
              key={day.id}
              style={[styles.dayTab, activeDayId === day.id && styles.dayTabActive]}
              onPress={() => store.setActiveDayId(day.id)}
              onLongPress={() => {
                Alert.alert(day.name || "未命名", undefined, [
                  { text: "编辑名称/日期", onPress: () => setDayEdit(day.id) },
                  ...(trip.data.days.length > 1
                    ? [
                        {
                          text: "删除这一天",
                          style: "destructive" as const,
                          onPress: () =>
                            Alert.alert("删除确认", `删除「${day.name || "未命名"}」及其全部地点？`, [
                              { text: "取消", style: "cancel" },
                              { text: "删除", style: "destructive", onPress: () => store.removeDay(day.id) },
                            ]),
                        },
                      ]
                    : []),
                  { text: "取消", style: "cancel" as const },
                ]);
              }}
            >
              <Text style={[styles.dayTabText, activeDayId === day.id && styles.dayTabTextActive]}>
                {day.name || "未命名"}
                {day.date ? `\n${day.date}` : ""}
              </Text>
            </Pressable>
          ))}
          <Pressable style={[styles.dayTab, styles.dayAdd]} onPress={() => store.addDay()}>
            <Text style={styles.dayAddText}>＋</Text>
          </Pressable>
        </ScrollView>

        <StopsList
          stops={stopsOfActiveDay}
          onMove={(idx, dir) => {
            const to = idx + dir;
            if (to < 0 || to >= stopsOfActiveDay.length) return;
            store.reorder(stopsOfActiveDay[0].dayId, idx, to);
          }}
          onStopPress={(id) => setPanelStop(id)}
        />

        {store.tool === "add" && !searchOpen ? (
          <View style={styles.hintBar}>
            <Text style={styles.hintText}>在地图上点击任意位置添加景点</Text>
          </View>
        ) : null}
      </View>

      <StopSheet stopId={panelStop} onClose={() => setPanelStop(null)} />

      <DayEditModal
        day={dayBeingEdited}
        onClose={() => setDayEdit(null)}
        onSave={({ name, date }) => {
          if (!dayBeingEdited) return;
          store.renameDay(dayBeingEdited.id, name);
          store.setDayDate(dayBeingEdited.id, date);
        }}
      />
    </View>
  );
}

function StopsList(props: {
  stops: Array<{ id: string; name?: string; order: number }>;
  onMove: (idx: number, dir: -1 | 1) => void;
  onStopPress: (id: string) => void;
}) {
  const { stops, onMove, onStopPress } = props;
  if (stops.length === 0) {
    return (
      <View style={styles.emptyStops}>
        <Text style={styles.emptyStopsText}>这一天还没有地点，搜索或点图添加吧</Text>
      </View>
    );
  }
  return (
    <ScrollView style={styles.stopList}>
      {stops.map((stop, i) => (
        <View key={stop.id} style={styles.stopRow}>
          <Pressable style={styles.stopMain} onPress={() => onStopPress(stop.id)}>
            <Text style={styles.stopIdx}>{i + 1}</Text>
            <Text style={styles.stopName} numberOfLines={1}>
              {stop.name || "未命名地点"}
            </Text>
          </Pressable>
          <Pressable style={styles.stopBtn} onPress={() => onMove(i, -1)} disabled={i === 0}>
            <Text style={[styles.stopBtnText, i === 0 && styles.stopBtnDisabled]}>↑</Text>
          </Pressable>
          <Pressable style={styles.stopBtn} onPress={() => onMove(i, 1)} disabled={i === stops.length - 1}>
            <Text style={[styles.stopBtnText, i === stops.length - 1 && styles.stopBtnDisabled]}>↓</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

/** 停留点详情弹层：重命名 / 备注 / 跨天移动 / 删除。 */
function StopSheet(props: { stopId: string | null; onClose: () => void }) {
  const store = useTripStore();
  const trip = store.trip;
  const stop = trip?.data.stops.find((s) => s.id === props.stopId) ?? null;
  const [name, setName] = React.useState("");
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    setName(stop?.name ?? "");
    setNote(stop?.note ?? "");
  }, [stop?.id]);

  if (!stop || !trip) return null;

  return (
    <Modal transparent visible animationType="slide" onRequestClose={props.onClose}>
      <Pressable style={styles.sheetMask} onPress={props.onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.sheetTitle}>编辑地点</Text>
          <Text style={styles.fieldLabel}>名称</Text>
          <TextInput style={styles.fieldInput} value={name} onChangeText={setName} placeholder="地点名称" />
          <Text style={styles.fieldLabel}>备注</Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldNote]}
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="想玩什么、吃什么…"
          />
          {trip.data.days.length > 1 ? (
            <>
              <Text style={styles.fieldLabel}>移动到</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {trip.data.days.map((d) => (
                  <Pressable
                    key={d.id}
                    style={[
                      styles.dayChip,
                      stop.dayId === d.id && styles.dayChipActive,
                    ]}
                    onPress={() => store.moveStopToDay(stop.id, d.id)}
                  >
                    <Text
                      style={[
                        styles.dayChipText,
                        stop.dayId === d.id && styles.dayChipTextActive,
                      ]}
                    >
                      {d.name || "未命名"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <View style={styles.sheetActions}>
            <Pressable
              style={[styles.sheetBtn, styles.sheetBtnDanger]}
              onPress={() => {
                store.removeStop(stop.id);
                props.onClose();
              }}
            >
              <Text style={[styles.sheetBtnText, { color: "#b91c1c" }]}>删除</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable style={styles.sheetBtn} onPress={props.onClose}>
              <Text style={styles.sheetBtnText}>取消</Text>
            </Pressable>
            <Pressable
              style={[styles.sheetBtn, styles.sheetBtnPrimary]}
              onPress={() => {
                store.updateStop(stop.id, { name: name.trim(), note: note.trim() || undefined });
                props.onClose();
              }}
            >
              <Text style={[styles.sheetBtnText, { color: "#fff" }]}>保存</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ToolButton(props: { label: string; active?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.toolBtn, props.active && styles.toolBtnActive]}
      disabled={props.disabled}
      onPress={props.onPress}
    >
      <Text style={[styles.toolBtnText, props.active && styles.toolBtnTextActive, props.disabled && styles.toolBtnDisabled]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fa" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  conflictBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fef3c7",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#fcd34d",
  },
  conflictText: { fontSize: 12, color: "#92400e", flexShrink: 1 },
  conflictBtn: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#fcd34d",
    alignItems: "center",
    justifyContent: "center",
  },
  conflictBtnText: { fontSize: 12, fontWeight: "700" },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
  },
  titleInput: { flex: 1, fontSize: 17, fontWeight: "700", color: BRAND.ink, paddingVertical: 4 },
  shareBtn: { fontSize: 13, fontWeight: "700", color: BRAND.primary },
  statusChip: {
    fontSize: 11,
    color: BRAND.primary,
    backgroundColor: BRAND.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
  },
  mapWrap: { flex: 1 },
  toolBar: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    gap: 6,
  },
  toolBtn: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 9,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: BRAND.border,
    alignItems: "center",
    justifyContent: "center",
  },
  toolBtnActive: { backgroundColor: BRAND.primary, borderColor: BRAND.primary },
  toolBtnText: { fontSize: 13, fontWeight: "600", color: BRAND.ink },
  toolBtnTextActive: { color: "#fff" },
  toolBtnDisabled: { opacity: 0.35 },
  panel: {
    maxHeight: 300,
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  dayTabs: { flexGrow: 0, paddingHorizontal: 12, marginBottom: 6 },
  dayTab: {
    paddingHorizontal: 14,
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: "#f4f4f5",
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  dayTabActive: { backgroundColor: BRAND.primary },
  dayTabText: { fontSize: 13, fontWeight: "600", color: BRAND.inkSoft, textAlign: "center" },
  dayTabTextActive: { color: "#fff" },
  dayAdd: { backgroundColor: BRAND.primarySoft },
  dayAddText: { color: BRAND.primary, fontWeight: "700" },
  stopList: { maxHeight: 170, paddingHorizontal: 12 },
  emptyStops: { alignItems: "center", justifyContent: "center", padding: 20, minHeight: 80 },
  emptyStopsText: { color: BRAND.inkSoft, fontSize: 13, textAlign: "center" },
  stopRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BRAND.border,
  },
  stopMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  stopIdx: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: BRAND.primary,
    color: BRAND.primary,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 19,
  },
  stopName: { fontSize: 14, color: BRAND.ink, flexShrink: 1 },
  stopBtn: { width: 32, height: 28, alignItems: "center", justifyContent: "center" },
  stopBtnText: { fontSize: 16, color: BRAND.primary, fontWeight: "700" },
  stopBtnDisabled: { opacity: 0.25 },
  hintBar: {
    position: "absolute",
    bottom: 8,
    left: 12,
    right: 12,
    backgroundColor: BRAND.primarySoft,
    borderRadius: 10,
    paddingVertical: 7,
    alignItems: "center",
  },
  hintText: { color: BRAND.primary, fontSize: 12, fontWeight: "600" },
  sheetMask: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    paddingBottom: 28,
    gap: 6,
  },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: BRAND.ink, marginBottom: 4 },
  fieldLabel: { fontSize: 12, color: BRAND.inkSoft, marginTop: 6 },
  fieldInput: {
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: BRAND.ink,
  },
  fieldNote: { minHeight: 64, textAlignVertical: "top" },
  dayChip: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dayChipActive: { backgroundColor: BRAND.primarySoft, borderColor: BRAND.primary },
  dayChipText: { fontSize: 12, color: BRAND.inkSoft, fontWeight: "600" },
  dayChipTextActive: { color: BRAND.primary },
  sheetActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  sheetBtn: {
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetBtnPrimary: { backgroundColor: BRAND.primary, borderColor: BRAND.primary },
  sheetBtnDanger: { borderColor: "#fecaca" },
  sheetBtnText: { fontSize: 14, fontWeight: "600", color: BRAND.ink },
});
