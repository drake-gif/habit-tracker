The Habit Tracker System

Is A responsive, installable habit-tracking web and mobile app. Create an account --> Add habits--> Tick them off every day after accomplishing each task--> Keep your streaks alive, view your progress in simple charts and (optionally) you can connect Google Calendar so planned events show up next to your habits with reminders.

It is a Frontend-only project(HTML,CSS and Javascript(JS)) with no build step and no dependencies needed for installation. 

To get It to your pc
clone the repository --> git clone https://github.com/drake-gif/habit-tracker
Open it in VS Code, start a local server and run the index.html.

Requirements to run the project

> [Visual Studio Code](https://code.visualstudio.com/)
> Modern browser (Chrome, Edge, Firefox, Safari)
> Optional: [Git](https://git-scm.com/) for GitHub

Steps by step to get the repository

1. Get the project folder (unzip "habit-tracker.zip", or clone your repo).
2. In VS Code choose `File → Open Folder` and select the `habit-tracker` folder.
3. Open the Extensions panel, search for `Live Server` (by Ritwick Dey) and install it.
4. Right-click `index.html` and choose `Open with Live Server`.
5. Your browser opens at `http://127.0.0.1:5500`. Create an account and start adding habits.

`Create an account`

> `Sign up` tab: enter your name, email and password. Click `Suggest a strong password` to generate a 16-character password, then save it in your password manager.
> Use the eye icon to show or hide what you type.
> Or click `Continue with Google` (requires [setup](#google-sign-in-and-calendar-setup)).

Deploying The Project

1. GitHub

Create the empty repository on github.com first (dont add the README there)

```bash
git init
git add .
git commit -m "Initial commit: habit tracker"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/habit-tracker.git
git push -u origin main
```


2. Netlify

1. Sign in at <https://netlify.com> with GitHub.
2. Add new site → Import an existing project, choose the repo.
3. Leave the build command empty, set the publish directory to `.`, and click `Deploy`.

3. Vercel

1. Sign in at <https://vercel.com> with GitHub.
2. Add New → Project, import the repo.
3. Framework Preset: `Other`. Leave build and output settings empty, then `Deploy`.
