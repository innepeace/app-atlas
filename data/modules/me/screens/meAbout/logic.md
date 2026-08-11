# meAbout — About

## Overview
`AboutViewController` (push). Static page showing app version and legal links.

## Branch Logic
### back
Pop to meSettings.

## Business Rules
- Version and build number read from `Bundle.main.infoDictionary`
- Terms/Privacy open in-app WebView
- Licenses shows all third-party libraries with MIT/Apache notices
