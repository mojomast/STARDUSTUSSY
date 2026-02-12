# HarmonyFlow SyncBridge - User Guide

**Version:** 1.0  
**Last Updated:** February 12, 2026  
**Target Audience:** End Users

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Features](#features)
3. [Multi-Device Handoff](#multi-device-handoff)
4. [FAQ](#faq)
5. [Support](#support)

---

## Quick Start

### Getting Started

Welcome to HarmonyFlow SyncBridge! This guide will help you get started with seamless wellness session synchronization across all your devices.

### What is SyncBridge?

SyncBridge allows you to:
- Start a wellness session on one device
- Seamlessly continue on another device
- Never lose your progress
- Keep your state synchronized in real-time

### Supported Devices

| Platform | Supported |
|----------|-----------|
| Web (Chrome, Firefox, Safari) | ✅ Yes |
| iOS (iPhone, iPad) | ✅ Yes |
| Android | ✅ Yes |
| Desktop (Mac, Windows, Linux) | ✅ Yes |

---

## Features

### Session Management

#### Starting a Session

1. **Open the HarmonyFlow app** on your device
2. **Select a session type** (Meditation, Breathing, Yoga, Mindfulness)
3. **Configure settings** (duration, audio, haptics)
4. **Tap "Start"** to begin your session

#### Session Types

| Type | Description | Duration |
|------|-------------|----------|
| Meditation | Guided meditation sessions | 5-60 minutes |
| Breathing | Breathing exercises | 2-20 minutes |
| Yoga | Yoga poses and flows | 10-60 minutes |
| Mindfulness | Mindfulness practices | 5-30 minutes |
| Custom | Create your own session | Any duration |

#### Managing Sessions

- **Pause a session:** Tap the pause button
- **Resume a session:** Tap the play button
- **End a session:** Tap the end button
- **View history:** Go to Sessions > History

### State Synchronization

#### Automatic Sync

Your session state is automatically synchronized across all your devices:
- Progress updates
- Settings changes
- Notes and comments
- Custom preferences

#### What Gets Synced

- ✅ Session progress
- ✅ Completion status
- ✅ User notes
- ✅ Settings preferences
- ✅ Achievements
- ❌ Payment information
- ❌ Personal profile (unless changed)

---

## Multi-Device Handoff

### Overview

Continue your session from one device to another seamlessly. Your progress, settings, and notes are all synchronized automatically.

### Setting Up Multi-Device

#### Step 1: Enable SyncBridge

1. Open Settings
2. Go to Account > SyncBridge
3. Enable "Multi-Device Sync"
4. Grant necessary permissions

#### Step 2: Add Devices

You can connect up to 5 devices to your account:

1. **Open HarmonyFlow** on the new device
2. **Sign in** with your account
3. **Scan QR code** from your primary device
4. **Confirm** the device pairing

#### Step 3: Verify Connection

- Go to Settings > SyncBridge
- Check "Connected Devices" list
- Verify all devices show as "Active"

### Handoff Procedure

#### Method 1: Automatic Handoff

1. **Start session** on Device A
2. **Open app** on Device B
3. **Tap "Continue"** when prompted
4. Session resumes on Device B

**Handoff completes in ~45ms!**

#### Method 2: Manual Handoff

1. **Pause session** on Device A
2. **Open app** on Device B
3. **Go to Sessions**
4. **Select active session**
5. **Tap "Continue Here"**

#### Method 3: QR Code Handoff

1. **Tap "Share Session"** on Device A
2. **Generate QR code**
3. **Scan QR code** on Device B
4. Session transfers to Device B

### Device Management

#### View Connected Devices

1. Go to Settings > SyncBridge
2. View all connected devices
3. See last sync time for each

#### Remove a Device

1. Go to Settings > SyncBridge
2. Select device to remove
3. Tap "Remove Device"
4. Confirm removal

#### Device Naming

Give your devices friendly names:
- "My iPhone"
- "Work Laptop"
- "Home Tablet"

### Troubleshooting Handoff

#### Handoff Not Working

**Check:**
- ✅ Both devices have internet connection
- ✅ Both devices are signed in to the same account
- ✅ SyncBridge is enabled on both devices
- ✅ Both devices have the latest app version

**Try:**
1. Refresh the session list
2. Force close and reopen the app
3. Sign out and sign back in
4. Re-add the device

#### State Not Syncing

**Check:**
- ✅ SyncBridge is enabled
- ✅ You have an active internet connection
- ✅ Your session is not paused for too long (> 7 days)

**Try:**
1. Pull to refresh
2. Check your internet connection
3. Restart the app

---

## FAQ

### General Questions

#### What happens to my data when I'm offline?

Your data is stored locally on your device and will sync automatically when you reconnect to the internet. You can continue your session offline and your progress will be preserved.

#### How long is my data stored?

- Active sessions: 7 days
- Completed sessions: 30 days
- Archived sessions: 180 days
- Personal notes: 365 days

#### Is my data secure?

Yes! Your data is encrypted both:
- **At rest** using AES-256 encryption
- **In transit** using TLS 1.3

#### Can I use SyncBridge offline?

Yes! You can:
- Start sessions offline
- Update your progress offline
- Take notes offline

Your data will sync when you reconnect.

### Technical Questions

#### What internet speed do I need?

- Minimum: 1 Mbps (basic sync)
- Recommended: 5 Mbps (smooth sync)
- Optimal: 10+ Mbps (instant sync)

#### Does SyncBridge use much data?

- Typical session: 50-100 KB
- Full sync: ~1 MB
- Daily usage: ~5-10 MB for active users

#### Can I sync across different platforms?

Yes! You can sync between:
- iOS ↔ Android
- Web ↔ Mobile
- Desktop ↔ Mobile

Any combination of your 5 devices.

### Account Questions

#### How many devices can I connect?

Free accounts: 2 devices
Premium accounts: 5 devices

#### What happens if I exceed the device limit?

You can:
1. Remove an old device
2. Upgrade to Premium for 5 devices

#### Can I share my account?

No, accounts are for individual use only. Sharing your account is a violation of our Terms of Service.

### Privacy Questions

#### What data is collected?

We collect:
- Session progress and completion
- Device information for sync
- Usage analytics (anonymous)

We do NOT collect:
- Payment information
- Personal conversations
- Location data
- Contact information

#### Can I export my data?

Yes! Go to Settings > Account > Export Data to download all your data.

#### How do I delete my data?

Go to Settings > Account > Delete Account. This will:
- Immediately delete your account
- Remove all your data from our servers
- Not be reversible

---

## Support

### Getting Help

#### In-App Help

1. Open Settings
2. Tap "Help & Support"
3. Browse articles or search for your issue

#### Contact Support

**Email:** support@harmonyflow.io  
**Response Time:** 24-48 hours

**Live Chat:** Available in the app  
**Hours:** 9 AM - 6 PM PST, Monday - Friday

#### Community Forums

Join our community: https://community.harmonyflow.io

### Reporting Issues

When reporting an issue, please include:

1. **Description** of the problem
2. **Steps to reproduce**
3. **Device information** (type, OS version)
4. **App version** (in Settings > About)
5. **Screenshots** (if applicable)
6. **Error messages** (if any)

### Feature Requests

We love hearing from our users! Submit feature requests at:
https://feedback.harmonyflow.io

---

## Tips and Tricks

### For Best Experience

1. **Keep your app updated** for the latest features
2. **Use a stable internet connection** for smooth sync
3. **Name your devices** for easy identification
4. **Enable notifications** to stay updated
5. **Back up your data** regularly

### Productivity Tips

- **Use handoff** when switching devices
- **Take notes** during sessions
- **Set reminders** to complete sessions
- **Review your progress** weekly
- **Celebrate achievements**!

### Advanced Tips

- **Create custom sessions** for specific goals
- **Use keyboard shortcuts** on desktop
- **Set up widgets** for quick access
- **Integrate with calendars** for reminders
- **Share achievements** with friends

---

## Glossary

| Term | Definition |
|------|------------|
| Session | A wellness activity (meditation, yoga, etc.) |
| Sync | Automatic data synchronization |
| Handoff | Transferring session between devices |
| State | Your progress, settings, and data |
| SyncBridge | Our synchronization technology |
| Device | Phone, tablet, computer, etc. |

---

## Accessibility

### Screen Readers

Our app is optimized for screen readers:
- VoiceOver (iOS)
- TalkBack (Android)
- NVDA/JAWS (Windows)
- VoiceOver (Mac)

### Keyboard Navigation

Full keyboard support:
- Tab to navigate
- Enter/Space to select
- Escape to go back

### Visual Accessibility

Adjust display settings:
- Text size: Settings > Accessibility > Text Size
- High contrast: Settings > Accessibility > Display
- Reduce motion: Settings > Accessibility > Reduce Motion

---

## Legal

### Terms of Service

By using HarmonyFlow SyncBridge, you agree to our Terms of Service:
https://harmonyflow.io/terms

### Privacy Policy

Your privacy is important to us. Read our full Privacy Policy:
https://harmonyflow.io/privacy

### Data Processing Agreement

For enterprise customers, our Data Processing Agreement is available upon request.

---

## What's Coming Soon

We're constantly improving SyncBridge! Coming soon:

- ✨ New session types
- 🌍 Offline-first mode
- 📊 Advanced analytics
- 👥 Family accounts
- 🎯 Personalized recommendations

Stay tuned for updates!

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-12

---

Thank you for choosing HarmonyFlow SyncBridge! We're here to help you on your wellness journey. 🧘‍♀️
