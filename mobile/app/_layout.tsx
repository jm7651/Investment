import { useEffect } from "react";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";

const queryClient = new QueryClient();

function useResponsiveCSS() {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const style = document.createElement("style");
    style.textContent = `
      @media (max-width: 768px) {
        [class*="r-minWidth"] {
          min-width: 100% !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);
}

export default function RootLayout() {
  useResponsiveCSS();

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="video/[id]"
          options={{ title: "영상 상세", headerBackTitle: "뒤로" }}
        />
        <Stack.Screen
          name="report/[id]"
          options={{ title: "리포트 상세", headerBackTitle: "뒤로" }}
        />
      </Stack>
    </QueryClientProvider>
  );
}
