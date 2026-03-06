# Seyran Website

Build on **Astro + React + Framer Motion + Tailwind CSS**

## 📝 How to add a new post

Open file `src/pages/index.astro` and add a new block `<Post>`:

```astro
<Post 
  client:load
  title="Name of the post"
  date="19 feb 2026"
>
  <p>Text...</p>
  <p>Can be a few paragraph.</p>
</Post>
```

Save a file and it will be automatically pushed.
---

## 🎨 Structure

```
seyran-website/
├── src/
│   ├── components/       # React components with animation
│   │   ├── Header.tsx    # Header of the site
│   │   └── Post.tsx      # The post's components
│   ├── layouts/          
│   │   └── BaseLayout.astro  # Basic HTML template
│   ├── pages/
│   │   └── index.astro   # Main page (here u adding posts)
│   └── styles/
│       └── global.css    # Global styles
├── package.json
└── README.md
```

---

Here is the full English translation of your text:

⸻

🎬 About Animations (Framer Motion)

All animations are configured inside the components Header.tsx and Post.tsx.

Current animations:
	•	Header — slides in from the top on load
	•	Posts — appear on scroll (fade in + slide up)
	•	Dividers — animated line after each post

How to add your own animations:

Open src/components/Post.tsx and tweak the parameters:

<motion.article
  initial={{ opacity: 0, y: 20 }}      // Initial state
  whileInView={{ opacity: 1, y: 0 }}   // Final state
  transition={{ duration: 0.6 }}       // Animation speed
>

Useful parameters:

	•	y: 50 — move down
	•	x: -100 — move left
	•	scale: 0.8 — scale
	•	rotate: 45 — rotate
	•	delay: 0.5 — delay

Framer Motion documentation:
https://www.framer.com/motion/

⸻

🌐 Deploy to Cloudflare Pages

Option 1: Via GitHub (recommended)
	1.	Create a GitHub repository:
```
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/seyran-website.git
git push -u origin main

```
	2.	Connect Cloudflare Pages:
	•	Go to https://dash.cloudflare.com
	•	Workers & Pages → Create application → Pages → Connect to Git
	•	Select the repository seyran-website
	3.	Build settings:
	•	Framework preset: Astro
	•	Build command: npm run build
	•	Build output directory: dist
	4.	Add your domain:
	•	Project settings → Custom domains → Set up a custom domain
	•	Enter seyran.cc
	•	DNS will be configured automatically

Done! Every git push will now automatically update your website.

⸻

Option 2: Direct deploy using Wrangler
```
npm install -g wrangler
npx wrangler pages deploy dist
```

⸻

🛠 Commands

Command	Action
```
npm install	Install dependencies
npm run dev	Run locally at localhost:4321
npm run build	Build production version into dist/
npm run preview	Preview production build
```

⸻

📚 What’s Next

Next steps:
	1.	✅ Run the site locally
	2.	✅ Add a few of your own posts
	3.	✅ Push to GitHub
	4.	✅ Connect Cloudflare Pages
	5.	⬜ Customize animations
	6.	⬜ Add images to posts
	7.	⬜ Change fonts and colors

Ideas for growth:
	-	Add dark/light theme
	-	Create a photo gallery
	-	Add tag filtering
	-	Implement post search
	-	Add RSS feed
	-	CMS integration (e.g., Contentful)

⸻

💡 Useful Links
- [Astro Docs](https://docs.astro.build)
- [Framer Motion Docs](https://www.framer.com/motion/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages)
￼ 
⸻

Good luck  to me! 🚀
