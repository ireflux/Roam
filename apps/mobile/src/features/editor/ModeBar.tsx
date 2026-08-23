import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MODE_LABEL, type Mode } from "@roam/core";
import { SEGMENT_COLORS, BRAND } from "@/lib/theme";
import type { SegState } from "@/store/useTripStore";

const MODES: Mode[] = ["driving", "walking", "cycling", "transit"];

/** 选中分段后的出行方式切换条 + 降级重试。 */
export function ModeBar(props: {
  mode: Mode;
  degraded: boolean;
  segState?: SegState;
  onMode: (m: Mode) => void;
  onRetry: () => void;
}) {
  return (
    <View style={styles.bar}>
      <View style={styles.chips}>
        {MODES.map((m) => {
          const active = m === props.mode;
          return (
            <Pressable
              key={m}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => !active && props.onMode(m)}
            >
              <Text
                style={[
                  styles.chipDot,
                  { backgroundColor: active ? "#fff" : SEGMENT_COLORS[m] },
                ]}
              />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{MODE_LABEL[m]}</Text>
            </Pressable>
          );
        })}
      </View>
      {props.degraded || props.segState === "error" ? (
        <Pressable style={styles.retry} onPress={props.onRetry}>
          <Text style={styles.retryText}>路线规划失败，点此重试</Text>
        </Pressable>
      ) : props.segState === "pending" ? (
        <Text style={styles.pending}>规划中…</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BRAND.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BRAND.border,
    backgroundColor: "#fafafa",
  },
  chipActive: { backgroundColor: BRAND.primary, borderColor: BRAND.primary },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 12, fontWeight: "600", color: BRAND.ink },
  chipTextActive: { color: "#fff" },
  retry: {
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: "center",
  },
  retryText: { fontSize: 12, fontWeight: "600", color: "#92400e" },
  pending: { fontSize: 12, color: BRAND.inkSoft, textAlign: "center", paddingVertical: 3 },
});
