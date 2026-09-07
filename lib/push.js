'use client';

import { supabase } from './supabase';

// VAPID public keys arrive from Supabase as a URL-safe base64 string;
// pushManager.subscribe() needs it as a raw Uint8Array instead.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function browserCanPush() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// iOS reports serviceWorker/PushManager support even in a plain Safari
// tab, but subscribe() only actually works once the app has been added to
// the Home Screen and opened from there (display-mode: standalone) — so
// that combination gets its own status instead of a confusing silent
// failure or a generic "not supported" message.
function isIosBrowserTab() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  return isIOS && !isStandalone;
}

// One of: 'unsupported' | 'ios-needs-install' | 'on' | 'off'.
export async function getPushStatus() {
  if (typeof window === 'undefined') return 'unsupported';
  if (isIosBrowserTab()) return 'ios-needs-install';
  if (!browserCanPush()) return 'unsupported';
  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    return subscription ? 'on' : 'off';
  } catch (err) {
    return 'off';
  }
}

export async function enablePushAlerts(vapidPublicKey) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted');

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const { endpoint, keys } = subscription.toJSON();
  // push_subscriptions.endpoint is unique, so this both registers a new
  // device and quietly re-confirms an existing one (e.g. after the
  // permission prompt is re-granted) without creating a duplicate row.
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' });
  if (error) throw error;
}

export async function disablePushAlerts() {
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  if (!subscription) return;
  const { endpoint } = subscription.toJSON();
  await subscription.unsubscribe();
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}
