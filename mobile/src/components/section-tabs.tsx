import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/theme";

export interface TabSection<T extends string = string> {
  id: T;
  label: string;
  badge?: string | number | null;
}

interface SectionTabsProps<T extends string = string> {
  sections: readonly TabSection<T>[] | TabSection<T>[];
  active: T;
  onChange: (id: T) => void;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

export function SectionTabs<T extends string = string>({
  sections,
  active,
  onChange,
  style,
  compact = false,
}: SectionTabsProps<T>) {
  const theme = useTheme();

  return (
    <View style={[styles.wrapper, { borderColor: theme.border, backgroundColor: theme.surface }, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.container, compact && styles.compactContainer]}
      >
        {sections.map((section, index) => {
          const isSelected = active === section.id;
          return (
            <Pressable
              key={section.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={section.label}
              onPress={() => onChange(section.id)}
              style={({ pressed }) => [
                styles.tab,
                compact && styles.compactTab,
                isSelected && {
                  borderBottomColor: theme.primary,
                  backgroundColor: theme.tint,
                },
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text
                style={[
                  styles.tabIndex,
                  { color: isSelected ? theme.primary : theme.muted },
                ]}
              >
                {String(index + 1).padStart(2, "0")}
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  styles.tabLabel,
                  {
                    color: isSelected ? theme.primary : theme.text,
                    fontWeight: isSelected ? "700" : "500",
                  },
                ]}
              >
                {section.label}
              </Text>
              {section.badge !== undefined && section.badge !== null && (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: isSelected ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      { color: isSelected ? theme.primaryText : theme.text },
                    ]}
                  >
                    {section.badge}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  container: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  compactContainer: {
    paddingVertical: 2,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
    minHeight: 46,
  },
  compactTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 38,
  },
  tabIndex: {
    fontSize: 11,
    fontWeight: "700",
  },
  tabLabel: {
    fontSize: 14,
    lineHeight: 20,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
});

