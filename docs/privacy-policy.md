# Privacy Policy

**Last updated: 2026-03-27**

## 1. Overview

This policy explains how ICA Mod Bot ("the App") handles data when installed on a subreddit.

## 2. Data Collected

The App collects and processes the following data:

- **Post metadata**: post ID, post title — used to identify which posts have been summarised
- **Comment content**: the text body and score of the top comments on a post — sent to Google Gemini to generate a summary

The App does **not** collect usernames, account details, or any other personally identifiable information.

## 3. How Data is Used

- **Comment text** is sent to the [Google Gemini API](https://ai.google.dev/) solely to generate a plain-text summary of the discussion. This data is not used to train any AI or ML model.
- **Post IDs** are stored in Redis (Devvit's key-value store) for up to **30 days** to prevent duplicate summaries from being posted.

## 4. Data Retention

- Redis keys (post IDs) are automatically deleted after **30 days**.
- When a post is deleted on Reddit, its associated Redis key is immediately deleted.
- No data is retained beyond these periods.

## 5. Third-Party Services

The App uses the **Google Gemini API** to generate summaries. Comment text from posts is sent to Google's servers for this purpose. Please review [Google's Privacy Policy](https://policies.google.com/privacy) for details on how Google handles API data.

Google's API terms state that data submitted via the Gemini API is **not** used to train Google's models by default.

## 6. Data Sharing

We do not sell, share, or otherwise commercialise any data. Data is only transmitted to Google Gemini as described above.

## 7. Your Rights

You may contact the moderators of the subreddit where the app is installed via Reddit Modmail for any data-related requests.

## 8. Changes

We may update this Privacy Policy at any time. Continued use of the app after changes constitutes acceptance of the new policy.

## 9. Contact

For questions, contact the subreddit moderators via Reddit Modmail.
