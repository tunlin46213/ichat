import { Redirect, type Href } from 'expo-router';

import { useAuth } from '@/context/auth';

// (tabs)/chats/index.tsx is served at "/chats"; the typed-routes generator lists it
// as "/chats/index", hence the cast.
const CHATS = '/chats' as Href;

/** Entry URL "/": send the user to the right place. */
export default function Index() {
  const { user } = useAuth();
  return <Redirect href={user ? CHATS : '/login'} />;
}
