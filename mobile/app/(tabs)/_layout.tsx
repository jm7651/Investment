import { Tabs } from "expo-router";
import { Text, Platform } from "react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#3E6AE1",
        tabBarInactiveTintColor: "#8E8E8E",
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopWidth: 0,
          height: "auto" as any,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
        },
        headerStyle: {
          backgroundColor: "#FFFFFF",
          shadowColor: "transparent",
          elevation: 0,
          borderBottomWidth: 0,
        },
        headerTitleStyle: {
          fontWeight: "500",
          fontSize: 17,
          color: "#171A20",
        },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: "피드",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 18, color }}>◻</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "리포트",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 18, color }}>◈</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="channels"
        options={{
          title: "채널",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 18, color }}>▶</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="stocks"
        options={{
          title: "종목",
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 18, color }}>◇</Text>
          ),
        }}
      />
    </Tabs>
  );
}
