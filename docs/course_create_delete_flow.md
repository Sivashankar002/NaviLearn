# Complete Code Flow: Creating & Deleting a Course

This document traces every single line of code that executes — across **6 files** — when an admin creates or deletes a course. We'll use a concrete example throughout.

---

## Files Involved

| Layer | File | Role |
|-------|------|------|
| Frontend Page | [AdminCatalog.jsx](file:///c:/Users/hiksm/Projects/LMS/client/src/pages/AdminCatalog.jsx) | UI form + buttons, React Query mutations |
| Frontend Utility | [api.js](file:///c:/Users/hiksm/Projects/LMS/client/src/utils/api.js) | Centralized fetch with auth headers |
| Frontend Config | [config.js](file:///c:/Users/hiksm/Projects/LMS/client/src/config.js) | Resolves `API_URL` from env |
| Backend Router | [server/index.js](file:///c:/Users/hiksm/Projects/LMS/server/index.js) | Mounts `/api/courses` route |
| Backend Middleware | [middleware/auth.js](file:///c:/Users/hiksm/Projects/LMS/server/middleware/auth.js) | JWT verification + role check |
| Backend Route | [routes/courses.js](file:///c:/Users/hiksm/Projects/LMS/server/routes/courses.js) | Business logic for CRUD |
| Backend Model | [models/Course.js](file:///c:/Users/hiksm/Projects/LMS/server/models/Course.js) | Mongoose schema + validation |

---

## Part 1: Creating a Course

**Scenario:** An admin types `title = "Data Structures"` and `description = "Learn arrays, trees, and graphs"` into the form and clicks **"Create Course"**.

---

### Phase 1 — User Interaction (Browser)

#### [AdminCatalog.jsx](file:///c:/Users/hiksm/Projects/LMS/client/src/pages/AdminCatalog.jsx)

**Step 1: State holds the form values**

```javascript
// Line 14-15
const [newTitle, setNewTitle] = useState('');          // → "Data Structures"
const [newDescription, setNewDescription] = useState(''); // → "Learn arrays, trees, and graphs"
```
As the admin types, the `onChange` handlers on the `<input>` (line 163) and `<textarea>` (line 173) call `setNewTitle` and `setNewDescription`, updating React state in real time.

**Step 2: Form submission fires `handleCreateCourse`**

When the admin clicks "Create Course", the `<form onSubmit={handleCreateCourse}>` (line 156) fires:

```javascript
// Lines 76-80
const handleCreateCourse = (e) => {
  e.preventDefault();                       // Prevents the browser from doing a full page reload
  if (!newTitle) return;                     // Quick guard — do nothing if title is empty
  createMutation.mutate({                    // 🔥 Fires the React Query mutation
    title: newTitle,                         // "Data Structures"
    description: newDescription              // "Learn arrays, trees, and graphs"
  });
};
```

- `e.preventDefault()` — Without this, the browser would submit the form as a traditional HTTP request, navigating away from the page.
- `createMutation.mutate(...)` — This is **not** calling the API directly. It tells React Query: *"Here's the data, now run the `mutationFn` I defined."*

**Step 3: React Query executes the `mutationFn`**

```javascript
// Lines 28-42
const createMutation = useMutation({
  mutationFn: (newCourse) =>                // newCourse = { title: "Data Structures", description: "Learn arrays..." }
    apiFetch('/api/courses', {              // Calls our centralized API utility
      method: 'POST',
      body: JSON.stringify(newCourse),       // Converts the object → '{"title":"Data Structures","description":"Learn arrays..."}'
    }),
  onSuccess: () => { ... },
  onError: (err) => { ... },
});
```

React Query calls `mutationFn` with the object we passed to `.mutate()`. Inside, it calls `apiFetch`.

---

### Phase 2 — The HTTP Request (api.js)

#### [api.js](file:///c:/Users/hiksm/Projects/LMS/client/src/utils/api.js)

The call is: `apiFetch('/api/courses', { method: 'POST', body: '{"title":"Data Structures",...}' })`

**Step 4: Destructure options**
```javascript
// Line 54
const { skipAuth = false, ...fetchOptions } = options;
```
`options` is `{ method: 'POST', body: '...' }`. Since `skipAuth` is not present, it defaults to `false`. `fetchOptions` becomes `{ method: 'POST', body: '...' }`.

**Step 5: Build headers — inject JWT**
```javascript
// Lines 57-65
const headers = { ...fetchOptions.headers };      // {} (no headers passed by caller)

if (!skipAuth) {                                   // skipAuth is false, so we enter this block
  const token = localStorage.getItem('accessToken'); // e.g. "eyJhbGciOiJIUzI1NiI..."
  if (token) {
    headers['Authorization'] = `Bearer eyJhbGciOiJIUzI1NiI...`;
  }
}
```

**Step 6: Auto-set Content-Type**
```javascript
// Lines 68-70
if (fetchOptions.body && !headers['Content-Type']) {  // body exists and no Content-Type set yet
  headers['Content-Type'] = 'application/json';
}
```
Headers are now: `{ Authorization: 'Bearer eyJ...', 'Content-Type': 'application/json' }`

**Step 7: Execute the native `fetch()`**
```javascript
// Lines 75-78
response = await fetch(`${config.API_URL}/api/courses`, {
  method: 'POST',
  body: '{"title":"Data Structures","description":"Learn arrays, trees, and graphs"}',
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiI...',
    'Content-Type': 'application/json'
  }
});
```
`config.API_URL` is resolved from [config.js](file:///c:/Users/hiksm/Projects/LMS/client/src/config.js) (e.g., `http://localhost:5000`).

The browser now sends this HTTP request over the network to the Express server.

---

### Phase 3 — The Server Receives the Request

#### [server/index.js](file:///c:/Users/hiksm/Projects/LMS/server/index.js)

**Step 8: Express middleware pipeline**

The request arrives at `POST http://localhost:5000/api/courses`.

```javascript
// Line 24-25 — Global middleware runs first
app.use(cors());            // Adds CORS headers (Access-Control-Allow-Origin)
app.use(express.json());    // Parses the JSON body string → req.body = { title: "Data Structures", ... }
```

```javascript
// Line 29 — Route matching
app.use('/api/courses', coursesRoutes);   // URL starts with /api/courses → hand off to courses router
```

---

### Phase 4 — Authentication & Authorization Middleware

#### [routes/courses.js](file:///c:/Users/hiksm/Projects/LMS/server/routes/courses.js) — Line 9

```javascript
router.post('/', protect, authorize('Admin'), async (req, res) => { ... });
```

This line registers a POST handler at `/` (relative to the mount point `/api/courses`). Before the handler runs, Express executes the middleware chain **left to right**: `protect` → `authorize('Admin')` → handler.

#### [middleware/auth.js](file:///c:/Users/hiksm/Projects/LMS/server/middleware/auth.js) — `protect`

**Step 9: Extract and verify JWT**

```javascript
// Line 8 — Check if Authorization header exists and starts with "Bearer"
if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
```
Our header is `"Bearer eyJhbGciOiJIUzI1NiI..."` — this condition is `true`.

```javascript
// Line 11 — Split on the space to isolate the token
token = req.headers.authorization.split(' ')[1];  // "eyJhbGciOiJIUzI1NiI..."
```

```javascript
// Line 14 — Verify the token's signature using our secret key
const decoded = jwt.verify(token, process.env.JWT_SECRET);
// decoded = { id: "665abc123def456...", iat: 1719300000, exp: 1719386400 }
```
If the token is expired or tampered with, `jwt.verify` throws an error, and the catch block (line 25-28) returns `401 Not authorized, token failed`.

```javascript
// Line 18 — Look up the user in MongoDB by the ID from the token
req.user = await User.findById(decoded.id).select('-password');
// req.user = { _id: "665abc...", name: "Admin User", email: "admin@lms.com", role: "Admin" }
```
The `.select('-password')` excludes the password hash from the result.

```javascript
// Line 24 — Pass control to the next middleware
return next();
```

**Step 10: Role authorization**

#### [middleware/auth.js](file:///c:/Users/hiksm/Projects/LMS/server/middleware/auth.js) — `authorize('Admin')`

```javascript
// Lines 36-44
const authorize = (...roles) => {             // roles = ['Admin']
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {  // req.user.role is 'Admin', ['Admin'].includes('Admin') → true
      return res.status(403).json({ ... });
    }
    return next();                             // ✅ Admin is authorized, proceed
  };
};
```

---

### Phase 5 — Business Logic (Create the Course)

#### [routes/courses.js](file:///c:/Users/hiksm/Projects/LMS/server/routes/courses.js) — Lines 9-30

```javascript
// Line 11 — Destructure the body that express.json() already parsed
const { title, description } = req.body;
// title = "Data Structures", description = "Learn arrays, trees, and graphs"
```

```javascript
// Lines 13-15 — Server-side validation
if (!title) {
  return res.status(400).json({ message: 'Course title is required' });
}
```
Title is present, so we skip this.

```javascript
// Lines 17-22 — Create a Mongoose document instance (NOT saved to DB yet)
const newCourse = new Course({
  title,                  // "Data Structures"
  description,            // "Learn arrays, trees, and graphs"
  modules: [],            // Empty array — no modules yet
  assessment: []          // Empty array — no questions yet
});
```

#### [models/Course.js](file:///c:/Users/hiksm/Projects/LMS/server/models/Course.js) — Schema validation

When `new Course(...)` is called, Mongoose creates an in-memory document and assigns:
- An auto-generated `_id` (e.g., `"667c1a2b3c4d5e6f7a8b9c0d"`)
- `title` is trimmed (due to `trim: true` on line 60)
- `description` is trimmed (due to `trim: true` on line 64)
- `timestamps: true` (line 69) will auto-add `createdAt` and `updatedAt` when saved

```javascript
// Line 24 — Persist to MongoDB
await newCourse.save();
```

This is where **Mongoose sends an `insertOne` command to MongoDB**. The database:
1. Validates the document against the schema
2. Writes it to the `courses` collection
3. Returns the saved document with `_id`, `createdAt`, and `updatedAt` populated

```javascript
// Line 25 — Send the saved course back as JSON with 201 Created
res.status(201).json(newCourse);
```

The response body looks like:
```json
{
  "_id": "667c1a2b3c4d5e6f7a8b9c0d",
  "title": "Data Structures",
  "description": "Learn arrays, trees, and graphs",
  "modules": [],
  "assessment": [],
  "createdAt": "2026-06-26T06:00:00.000Z",
  "updatedAt": "2026-06-26T06:00:00.000Z",
  "__v": 0
}
```

---

### Phase 6 — Response Travels Back to the Client

#### [api.js](file:///c:/Users/hiksm/Projects/LMS/client/src/utils/api.js) — Lines 88-111

```javascript
// Line 88 — Check if the response was successful (status 200-299)
if (!response.ok) { ... }  // response.status is 201, so response.ok is TRUE. We skip the error block.
```

```javascript
// Lines 106-108 — Parse the JSON body
const contentType = response.headers.get('content-type');  // "application/json; charset=utf-8"
if (contentType && contentType.includes('application/json')) {
  return response.json();     // Returns the parsed course object to the caller
}
```

#### [AdminCatalog.jsx](file:///c:/Users/hiksm/Projects/LMS/client/src/pages/AdminCatalog.jsx) — `onSuccess`

The mutation succeeded, so React Query calls `onSuccess`:

```javascript
// Lines 34-38
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['adminCourses'] });  // 🔄 Tells React Query to refetch the course list
  setNewTitle('');                                                 // Clear the form title input
  setNewDescription('');                                           // Clear the form description input
},
```

`invalidateQueries` marks the `['adminCourses']` cache as **stale**. React Query immediately re-runs the `queryFn` from lines 22-25 (a GET to `/api/courses`), which fetches the fresh list including the new "Data Structures" course. React re-renders the page, and the new course card appears in the grid.

---

## Part 2: Deleting a Course

**Scenario:** The admin clicks the trash icon on the "Data Structures" course card (ID: `"667c1a2b3c4d5e6f7a8b9c0d"`).

---

### Phase 1 — User Interaction (Browser)

#### [AdminCatalog.jsx](file:///c:/Users/hiksm/Projects/LMS/client/src/pages/AdminCatalog.jsx)

**Step 1: Click the delete button**

The trash icon button is on line 138-143:

```jsx
<button onClick={(e) => handleDeleteCourse(course._id, e)} ...>
  <Trash2 />
</button>
```

**Step 2: Confirmation and mutation trigger**

```javascript
// Lines 82-86
const handleDeleteCourse = (courseId, e) => {
  e.stopPropagation();    // ⚠️ CRITICAL — The button is INSIDE a clickable <div> (line 129) that navigates
                          //   to the course detail page. Without stopPropagation(), clicking delete would
                          //   ALSO trigger navigation. This stops the click from bubbling up to the parent div.

  if (!window.confirm('Are you sure you want to delete this course?')) return;  // Browser confirmation dialog

  deleteMutation.mutate(courseId);   // courseId = "667c1a2b3c4d5e6f7a8b9c0d"
};
```

**Step 3: Optimistic Update (React Query magic)**

The delete mutation is different from create — it uses an **optimistic update** pattern:

```javascript
// Lines 45-73
const deleteMutation = useMutation({
  mutationFn: (courseId) =>
    apiFetch(`/api/courses/${courseId}`, { method: 'DELETE' }),
```

But BEFORE the API call is even made, `onMutate` runs:

```javascript
  onMutate: async (courseId) => {
    // Line 52 — Cancel any in-flight refetch of the course list so it doesn't
    //           overwrite our optimistic removal
    await queryClient.cancelQueries({ queryKey: ['adminCourses'] });

    // Line 55 — Take a SNAPSHOT of the current course list (for rollback)
    const previousCourses = queryClient.getQueryData(['adminCourses']);
    // previousCourses = [{ _id: "667c...", title: "Data Structures", ... }, { ... }, ...]

    // Line 58-60 — Immediately remove the course from the cache
    queryClient.setQueryData(['adminCourses'], (old) =>
      old?.filter(c => c._id !== courseId) || []
    );
    // The "Data Structures" card DISAPPEARS from the UI instantly — no waiting for the server!

    // Line 62 — Return the snapshot so we can undo if the server call fails
    return { previousCourses };
  },
```

> [!TIP]
> **Why optimistic updates?** The UI feels instant. The card vanishes the moment you click delete, rather than showing a loading spinner for 200-500ms while the server responds. If the server fails, we roll it back.

---

### Phase 2 — The HTTP Request

#### [api.js](file:///c:/Users/hiksm/Projects/LMS/client/src/utils/api.js)

The call is: `apiFetch('/api/courses/667c1a2b3c4d5e6f7a8b9c0d', { method: 'DELETE' })`

**Step 4: Build and send the request**

Same process as create:
- `skipAuth` defaults to `false` → JWT is attached
- No `body` → `Content-Type` is NOT set (it's a DELETE, no body needed)

```javascript
response = await fetch('http://localhost:5000/api/courses/667c1a2b3c4d5e6f7a8b9c0d', {
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiI...'
  }
});
```

---

### Phase 3 — Server: Auth → Delete

#### [middleware/auth.js](file:///c:/Users/hiksm/Projects/LMS/server/middleware/auth.js)

**Step 5:** `protect` and `authorize('Admin')` run identically to the create flow — JWT verified, admin role confirmed. `next()` is called.

#### [routes/courses.js](file:///c:/Users/hiksm/Projects/LMS/server/routes/courses.js) — Lines 87-100

```javascript
router.delete('/:id', protect, authorize('Admin'), async (req, res) => {
```
Express extracts the `:id` parameter → `req.params.id = "667c1a2b3c4d5e6f7a8b9c0d"`

**Step 6: Find the course first**
```javascript
// Line 89 — Verify the course exists before deleting
const course = await Course.findById(req.params.id);
if (!course) {
  return res.status(404).json({ message: 'Course not found' });  // Guard against deleting a non-existent course
}
```

**Step 7: Delete from MongoDB**
```javascript
// Line 94 — Send a deleteOne command to MongoDB
await Course.findByIdAndDelete(req.params.id);
```
MongoDB removes the document from the `courses` collection permanently.

**Step 8: Send success response**
```javascript
// Line 95
res.json({ message: 'Course deleted successfully' });
// HTTP 200 with body: { "message": "Course deleted successfully" }
```

---

### Phase 4 — Response Returns to Client

#### [api.js](file:///c:/Users/hiksm/Projects/LMS/client/src/utils/api.js)

- `response.ok` is `true` (status 200)
- Content-Type is JSON → `return response.json()` → `{ message: "Course deleted successfully" }`

#### [AdminCatalog.jsx](file:///c:/Users/hiksm/Projects/LMS/client/src/pages/AdminCatalog.jsx) — `onSettled`

Since the mutation succeeded, `onError` is NOT called. `onSettled` runs regardless:

```javascript
// Lines 69-72
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: ['adminCourses'] });  // Refetch the course list from the server
},                                                                // to make sure our optimistic removal was correct
```

This ensures that the UI is **eventually consistent** with the database, even if something weird happened.

---

### What If the Delete FAILS?

If the server returns an error (e.g., network timeout, 500 error), `onError` runs:

```javascript
// Lines 64-68
onError: (err, courseId, context) => {
  // ROLLBACK: Put the deleted course card BACK into the UI
  queryClient.setQueryData(['adminCourses'], context.previousCourses);
  alert(err.message);   // Show the error to the admin
},
```

`context.previousCourses` is the snapshot we saved in `onMutate`. The course card **reappears** in the list as if nothing happened.

---

## Visual Summary: Complete Data Flow

```mermaid
sequenceDiagram
    participant U as Admin (Browser)
    participant AC as AdminCatalog.jsx
    participant RQ as React Query
    participant API as api.js
    participant EX as Express Server
    participant MW as auth.js Middleware
    participant RT as courses.js Route
    participant DB as MongoDB

    Note over U,DB: ── CREATE FLOW ──

    U->>AC: Types "Data Structures" + clicks Create
    AC->>RQ: createMutation.mutate({ title, description })
    RQ->>API: apiFetch('/api/courses', { method: 'POST', body: '...' })
    API->>API: Inject JWT + Content-Type headers
    API->>EX: POST /api/courses
    EX->>EX: cors() + express.json() parses body
    EX->>MW: protect() — verify JWT
    MW->>MW: authorize('Admin') — check role
    MW->>RT: next() — authorized
    RT->>DB: new Course({...}).save()
    DB-->>RT: Saved document with _id
    RT-->>API: 201 JSON response
    API-->>RQ: Parsed course object
    RQ->>RQ: onSuccess → invalidateQueries
    RQ->>AC: Re-render with new course in list

    Note over U,DB: ── DELETE FLOW ──

    U->>AC: Clicks trash icon → confirms
    AC->>RQ: deleteMutation.mutate(courseId)
    RQ->>RQ: onMutate → optimistically remove from cache
    AC->>AC: Course card disappears instantly
    RQ->>API: apiFetch('/api/courses/667c...', { method: 'DELETE' })
    API->>API: Inject JWT header
    API->>EX: DELETE /api/courses/667c...
    EX->>MW: protect() + authorize('Admin')
    MW->>RT: next()
    RT->>DB: Course.findByIdAndDelete(id)
    DB-->>RT: Deletion confirmed
    RT-->>API: 200 { message: 'Course deleted' }
    API-->>RQ: Success
    RQ->>RQ: onSettled → invalidateQueries (verify)
```
