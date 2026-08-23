import * as React from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BRAND } from "@/lib/theme";
import type { TripDay } from "@roam/core";

/** 天的重命名 + 日期设置弹窗（YYYY-MM-DD，可清空）。 */
export function DayEditModal(props: {
  day: TripDay | null;
  onClose: () => void;
  onSave: (patch: { name: string; date: string | null }) => void;
}) {
  const [name, setName] = React.useState("");
  const [date, setDate] = React.useState("");

  React.useEffect(() => {
    setName(props.day?.name ?? "");
    setDate(props.day?.date ?? "");
  }, [props.day?.id]);

  if (!props.day) return null;
  const dateValid = date === "" || /^\d{4}-\d{2}-\d{2}$/.test(date.trim());

  return (
    <Modal transparent visible animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={styles.mask} onPress={props.onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>编辑天</Text>
          <Text style={styles.label}>名称</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="如：第一天" />
          <Text style={styles.label}>日期（可选，YYYY-MM-DD）</Text>
          <TextInput
            style={[styles.input, !dateValid && styles.inputInvalid]}
            value={date}
            onChangeText={setDate}
            placeholder="2026-10-01"
            autoCapitalize="none"
          />
          {!dateValid ? <Text style={styles.warn}>日期格式应为 YYYY-MM-DD</Text> : null}
          <View style={styles.actions}>
            <Pressable style={styles.btn} onPress={props.onClose}>
              <Text style={styles.btnText}>取消</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.primary]}
              disabled={!dateValid}
              onPress={() => {
                props.onSave({ name: name.trim() || props.day!.name || "未命名", date: date.trim() || null });
                props.onClose();
              }}
            >
              <Text style={[styles.btnText, styles.primaryText]}>保存</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  sheet: { width: "86%", backgroundColor: "#fff", borderRadius: 16, padding: 16, gap: 6 },
  title: { fontSize: 16, fontWeight: "700", color: BRAND.ink },
  label: { fontSize: 12, color: BRAND.inkSoft, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: BRAND.ink,
  },
  inputInvalid: { borderColor: "#f87171" },
  warn: { fontSize: 11, color: "#b91c1c" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 },
  btn: {
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BRAND.border,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: BRAND.primary, borderColor: BRAND.primary },
  btnText: { fontSize: 14, fontWeight: "600", color: BRAND.ink },
  primaryText: { color: "#fff" },
});
