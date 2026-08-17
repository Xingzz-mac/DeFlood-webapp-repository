Design a clean, professional, responsive web app UI for **DeFlood.AI: Risk Assessment, Evacuation Planner & Support Network**, a flood-preparedness platform designed for communities in Myanmar.

The app will be used mainly by:

* Village and community leaders
* Town or municipal leaders / mayors
* Authorised assistants
* NGOs and humanitarian organisations
* Government or disaster-response teams

The interface should feel like a **serious emergency-management platform**, not a futuristic AI dashboard. Keep it simple enough for users with limited technical experience.

## Design style

* Modern, clean, trustworthy and calm
* Minimal clutter
* Large readable text
* Clear visual hierarchy
* Simple English
* Accessible buttons and controls
* Responsive for desktop, tablet and mobile
* Designed to remain understandable on small screens and in stressful situations
* Use colour carefully for flood risk:

  * Green = Low
  * Amber/Orange = Medium
  * Red = High
* Do not rely only on colour; always include text labels and icons
* Avoid excessive gradients, glassmorphism, neon effects or overly futuristic AI visuals
* Use consistent cards, spacing, typography, icons and buttons throughout

## Main navigation

Create a simple sidebar on desktop and a compact mobile navigation system.

Main sections:

1. Dashboard
2. Risk Assessment
3. Evacuation Plan
4. Map
5. Support Network
6. Community Information
7. Settings

Keep the most urgent information accessible within one or two clicks.

---

## 1. Sign In / Community Access

Create a simple login screen where an authorised user can:

* Select or enter their community
* Enter a PIN or sign in
* Show their role, such as Community Leader, Mayor, Assistant, NGO or Government User

Keep this screen extremely simple.

---

## 2. Main Dashboard

This should be the most important screen.

At the top, prominently show:

**Current Flood Risk: LOW / MEDIUM / HIGH**

Also show:

* Confidence level
* Community name and location
* Last data update
* Next expected update

Create a large main recommendation card such as:

**HIGH RISK**
“Begin evacuation preparations. Move vulnerable residents first.”

Below this, show compact cards for:

* Rainfall
* River level
* Weather forecast
* Ground/elevation information
* Population at risk
* Available evacuation capacity
* Active assistance requests

Include obvious actions:

* View Risk Details
* Prepare Evacuation
* Request Assistance

The user should understand the current situation within approximately 5 seconds of opening the dashboard.

---

## 3. Risk Assessment

Show the factors contributing to the flood-risk level.

Include:

* Recent rainfall
* Forecast rainfall
* Nearby river level
* Ground elevation
* Previous flood information
* Current risk level
* Confidence level

Include a section titled:

**Why is the risk HIGH?**

Explain the result in plain language rather than technical AI terminology.

Example:

“Heavy rainfall is expected and the nearby river level is approaching a dangerous level.”

Do not make the system look like it predicts risk magically. Clearly show the evidence used.

---

## 4. Evacuation Planner

Create an organised form/dashboard containing:

### Population

* Total residents
* Children
* Elderly residents
* People with disabilities or mobility difficulties
* Other vulnerable residents

### Available Resources

* Volunteers
* Cars/trucks
* Boats
* Other transport
* Available shelters
* Shelter capacity

### Supplies

* Drinking water
* Food
* Medicine
* Emergency equipment

Then display a generated evacuation plan.

Example structure:

**Priority 1**
Evacuate elderly residents, children and people with mobility difficulties.

**Priority 2**
Evacuate residents in the highest-risk areas.

**Transport**
Assign available boats and vehicles.

**Shelter**
Show where residents should be moved and remaining shelter capacity.

Use clear numbered steps rather than large paragraphs.

---

## 5. Community Flood Map

Design a simple map interface showing:

* Current community
* Nearby communities
* Flood-risk areas
* Shelters
* Important roads/routes
* Communities requesting assistance

Use map markers and risk indicators.

Selecting a community should open a simple information card containing:

* Community name
* Risk level
* Population
* Current needs
* Assistance status

Do not overcrowd the map.

---

## 6. Support Network / Request Assistance

Allow local leaders to request:

* Rescue assistance
* Boats
* Vehicles
* Food
* Drinking water
* Medicine
* Shelter
* Volunteers
* Other supplies

Show:

* Request priority
* Requested quantity
* Time submitted
* Status: Pending / Accepted / In Progress / Completed

For HIGH-risk situations, show an obvious warning that an emergency assistance request can be prepared or triggered according to system rules.

Include a clear **Request Assistance** button.

---

## 7. NGO / Government Dashboard

Create a different dashboard view for NGOs, municipal authorities and disaster-response organisations.

Show communities as prioritised cards or a table.

Each community should display:

* Community name
* Risk level
* Population affected
* Vulnerable population
* Assistance requested
* Time of request
* Current response status

Provide useful filters:

* Highest risk
* Most urgent
* Assistance type
* Location
* Request status

Allow the user to open an individual community and see its needs.

---

## 8. Community Information

Allow authorised local users to update:

* Community name
* Township/region
* Population
* Number of vulnerable residents
* Community leader
* Mayor/local authority where applicable
* Authorised assistants
* Contact information
* Available shelters
* Vehicles
* Boats
* Volunteers
* Emergency supplies

Organise this into clear sections rather than one massive form.

---

## Prototype flow

Create clickable interactions for the most important journey:

**Sign In → Dashboard → High Risk Alert → View Risk Details → Prepare Evacuation → View Evacuation Plan → Request Assistance → Assistance Request Submitted**

Also create a second flow:

**NGO/Government Dashboard → See High-Risk Community → Open Community → View Needs → Respond to Assistance Request**

---

## Important constraints

This is an MVP for a youth AI competition.

Prioritise functionality, clarity and realism over unnecessary features.

Do NOT:

* add social-media features
* add complex charts just for decoration
* add chatbots everywhere
* make every screen look AI-generated
* use fake futuristic technology
* overload the dashboard with data
* make navigation complicated

The interface should make judges immediately understand:

**What is happening? → How serious is it? → What should we do? → What resources do we have? → Who needs help?**

First generate a consistent desktop design system and the main screens. Then adapt the most important screens for mobile.
