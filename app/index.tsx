import { Redirect } from 'expo-router';

export default function Index() {
  // For now, redirect to tabs (home screen)
  // In a real app, you'd check auth state and redirect accordingly
  return <Redirect href="/(tabs)" />;
}
