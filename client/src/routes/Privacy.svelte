<svelte:head>
  <title>Privacy Policy: VIA</title>
  <meta name="description" content="Privacy Policy for VIA, the event hub for UIUC ECE student organizations." />
</svelte:head>

<div class="max-w-2xl mx-auto space-y-6">

  <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-2">
    <h1 class="text-3xl font-bold tracking-tight">Privacy Policy</h1>
    <p class="text-xs text-muted-foreground">Effective April 23, 2026</p>
  </div>

  <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3">
    <h2 class="text-lg font-semibold">1. Overview</h2>
    <p class="text-sm text-muted-foreground leading-relaxed">
      VIA is a student-built platform. We collect only the minimum information needed to
      operate the service, do not sell or share your data with third parties for advertising,
      and do not run any third-party analytics or tracking scripts.
    </p>
  </div>

  <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3">
    <h2 class="text-lg font-semibold">2. Information We Collect</h2>

    <h3 class="text-sm font-medium">When you sign in with your UIUC NetID</h3>
    <p class="text-sm text-muted-foreground leading-relaxed">
      Authentication is handled by Microsoft Azure Active Directory using your UIUC
      credentials, so VIA never sees your password. Upon successful sign-in, we store
      your NetID, display name, and @illinois.edu email address in our database to
      identify your account and display your name within the platform.
    </p>

    <h3 class="text-sm font-medium mt-3">When you interact with the platform</h3>
    <ul class="text-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
      <li><strong class="text-foreground">RSVPs:</strong> if you RSVP to an event, we store that association so RSO admins can see attendance estimates.</li>
      <li><strong class="text-foreground">Midterm votes:</strong> if you confirm or dispute a midterm date, we store your vote to compute community-sourced exam dates.</li>
      <li><strong class="text-foreground">Events you create:</strong> event content posted through the RSO dashboard is stored and displayed publicly (or to board members, if marked internal).</li>
    </ul>

    <h3 class="text-sm font-medium mt-3">Server logs</h3>
    <p class="text-sm text-muted-foreground leading-relaxed">
      Our server records standard HTTP access logs (IP address, request path, timestamp)
      for debugging and security purposes. Logs are not used for profiling and are rotated
      periodically.
    </p>
  </div>

  <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3">
    <h2 class="text-lg font-semibold">3. Cookies</h2>
    <p class="text-sm text-muted-foreground leading-relaxed">
      VIA uses a single <code class="font-mono text-xs bg-muted px-1 py-0.5 rounded">via_token</code> HttpOnly cookie to keep you signed in between
      sessions. This cookie contains a signed JWT with your NetID and admin status, and no
      tracking identifiers. A short-lived session cookie is also set during the sign-in
      redirect flow and expires immediately after authentication completes.
    </p>
    <p class="text-sm text-muted-foreground leading-relaxed">
      No third-party cookies are set. Browsing VIA without signing in sets no cookies at all.
    </p>
  </div>

  <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3">
    <h2 class="text-lg font-semibold">4. How We Use Your Information</h2>
    <ul class="text-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
      <li>To authenticate you and maintain your session.</li>
      <li>To display your name in RSO dashboards where you are a board member or editor.</li>
      <li>To associate events, RSVPs, and votes with your account.</li>
      <li>To allow global administrators to manage accounts and platform content.</li>
    </ul>
    <p class="text-sm text-muted-foreground leading-relaxed mt-2">
      We do not use your information for advertising, profiling, or any purpose unrelated
      to operating this platform.
    </p>
  </div>

  <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3">
    <h2 class="text-lg font-semibold">5. Data Sharing</h2>
    <p class="text-sm text-muted-foreground leading-relaxed">
      We do not sell, rent, or share your personal information with third parties, except:
    </p>
    <ul class="text-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
      <li><strong class="text-foreground">Microsoft / Azure AD:</strong> your sign-in is processed by UIUC's Microsoft tenant. Their privacy practices are governed by <a href="https://privacy.microsoft.com" class="underline underline-offset-2 hover:text-foreground transition-colors" target="_blank" rel="noopener">Microsoft's Privacy Statement</a>.</li>
      <li><strong class="text-foreground">Hosting infrastructure:</strong> the platform runs on Google Cloud Platform. Data at rest is stored on GCP Cloud SQL. GCP's practices are governed by <a href="https://cloud.google.com/terms/data-processing-terms" class="underline underline-offset-2 hover:text-foreground transition-colors" target="_blank" rel="noopener">Google's Data Processing Terms</a>.</li>
    </ul>
  </div>

  <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3">
    <h2 class="text-lg font-semibold">6. Data Retention</h2>
    <p class="text-sm text-muted-foreground leading-relaxed">
      Account data is retained for as long as the platform is active or until you request
      deletion. As a student project, data may be wiped during major platform resets or at
      the end of a semester. We will make reasonable efforts to notify users before any
      mass data deletion.
    </p>
  </div>

  <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3">
    <h2 class="text-lg font-semibold">7. Your Rights</h2>
    <p class="text-sm text-muted-foreground leading-relaxed">
      You may request deletion of your account and associated personal data at any time by
      contacting us through the <a href="/about" class="underline underline-offset-2 hover:text-foreground transition-colors">About</a> page.
      Deleting your account removes your profile and login credentials. Event content you
      created as an RSO board member may be retained for historical continuity.
    </p>
  </div>

  <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3">
    <h2 class="text-lg font-semibold">8. Changes to This Policy</h2>
    <p class="text-sm text-muted-foreground leading-relaxed">
      We may update this Privacy Policy as the platform evolves. The effective date at the
      top of this page reflects the most recent revision. Continued use of VIA after changes
      are posted constitutes acceptance of the revised policy.
    </p>
  </div>

  <div class="rounded-xl p-6 bg-background/95 backdrop-blur-sm border space-y-3">
    <h2 class="text-lg font-semibold">9. Contact</h2>
    <p class="text-sm text-muted-foreground leading-relaxed">
      Questions or requests regarding your data can be directed through the
      <a href="/about" class="underline underline-offset-2 hover:text-foreground transition-colors">About</a> page.
    </p>
  </div>

</div>
