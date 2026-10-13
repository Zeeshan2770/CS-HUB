import { lazy, Suspense } from 'react';
import { Route, Routes, Link, Navigate } from 'react-router-dom';
import { FeedbackProvider } from './lib/toast.jsx';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { CatalogProvider } from './lib/catalog.jsx';
import { ProgressProvider } from './lib/progress.jsx';
import { configured } from './lib/supabase.js';
import Layout from './components/Layout.jsx';
import { RequireAuth, RequireRole } from './components/Guards.jsx';
import { ErrorBoundary, Spinner } from './components/ui.jsx';
import Home from './pages/Home.jsx';

const L = (f) => lazy(f);
const Login = L(() => import('./pages/AuthPages.jsx').then((m) => ({ default: m.Login })));
const Signup = L(() => import('./pages/AuthPages.jsx').then((m) => ({ default: m.Signup })));
const Reset = L(() => import('./pages/AuthPages.jsx').then((m) => ({ default: m.Reset })));
const UpdatePassword = L(() => import('./pages/AuthPages.jsx').then((m) => ({ default: m.UpdatePassword })));
const Dashboard = L(() => import('./pages/Dashboard.jsx'));
const Syllabus = L(() => import('./pages/Syllabus.jsx'));
const Chapter = L(() => import('./pages/Chapter.jsx'));
const Lesson = L(() => import('./pages/Lesson.jsx'));
const Search = L(() => import('./pages/Search.jsx'));
const Labs = L(() => import('./pages/Labs.jsx'));
const PythonLab = L(() => import('./pages/PythonLab.jsx'));
const LogicLab = L(() => import('./pages/LogicLab.jsx'));
const SubnetLab = L(() => import('./pages/SubnetLab.jsx'));
const DebuggerLab = L(() => import('./pages/DebuggerLab.jsx'));
const SqlLab = L(() => import('./pages/SqlLab.jsx'));
const Practice = L(() => import('./pages/Practice.jsx'));
const QuizSession = L(() => import('./pages/QuizSession.jsx'));
const QuizResults = L(() => import('./pages/QuizResults.jsx'));
const Revision = L(() => import('./pages/Revision.jsx'));
const Bookmarks = L(() => import('./pages/Bookmarks.jsx'));
const Planner = L(() => import('./pages/Planner.jsx'));
const Focus = L(() => import('./pages/Focus.jsx'));
const CheatSheet = L(() => import('./pages/CheatSheet.jsx'));
const Assignments = L(() => import('./pages/Assignments.jsx'));
const Teach = L(() => import('./pages/Teach.jsx'));
const TeachClass = L(() => import('./pages/TeachClass.jsx'));
const TeachAssignment = L(() => import('./pages/TeachAssignment.jsx'));
const Profile = L(() => import('./pages/Profile.jsx'));
const AdminLayout = L(() => import('./pages/admin/AdminLayout.jsx'));
const AdminHome = L(() => import('./pages/admin/AdminHome.jsx'));
const AdminWritten = L(() => import('./pages/admin/AdminWritten.jsx'));
const AdminGrading = L(() => import('./pages/admin/AdminGrading.jsx'));
const Written = L(() => import('./pages/Written.jsx'));
const WrittenQuestion = L(() => import('./pages/WrittenQuestion.jsx'));
const AdminContent = L(() => import('./pages/admin/AdminContent.jsx'));
const LessonEditor = L(() => import('./pages/admin/LessonEditor.jsx'));
const AdminQuestions = L(() => import('./pages/admin/AdminQuestions.jsx'));
const AdminImport = L(() => import('./pages/admin/AdminImport.jsx'));
const AdminUsers = L(() => import('./pages/admin/AdminUsers.jsx'));
const AdminAudit = L(() => import('./pages/admin/AdminAudit.jsx'));

function AdminIndex() {
  const { isStaff } = useAuth();
  return isStaff ? <AdminHome /> : <Navigate to="/admin/grading" replace />;
}

function NotFound() {
  return (
    <div className="page narrow center">
      <h1>Page not found</h1>
      <p className="muted">That address does not exist, or the lesson was unpublished.</p>
      <div className="row center"><Link className="btn btn-primary" to="/">Go home</Link><Link className="btn" to="/syllabus">Browse the syllabus</Link></div>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="page narrow">
      <h1>Connect the database</h1>
      <p>This site needs two environment variables before it can load lessons:</p>
      <pre className="code"><code>VITE_SUPABASE_URL{'\n'}VITE_SUPABASE_ANON_KEY</code></pre>
      <p>Add them in Netlify (Site configuration, Environment variables), then redeploy. For local work, copy <code>.env.example</code> to <code>.env</code>.</p>
    </div>
  );
}

export default function App() {
  if (!configured) return <NotConfigured />;
  const A = ({ children }) => <RequireAuth>{children}</RequireAuth>;
  return (
    <FeedbackProvider>
      <AuthProvider>
        <CatalogProvider>
          <ProgressProvider>
            <ErrorBoundary>
              <Suspense fallback={<Spinner />}>
                <Routes>
                  <Route element={<Layout />}>
                    <Route index element={<Home />} />
                    <Route path="login" element={<Login />} />
                    <Route path="signup" element={<Signup />} />
                    <Route path="reset" element={<Reset />} />
                    <Route path="update-password" element={<UpdatePassword />} />
                    <Route path="dashboard" element={<A><Dashboard /></A>} />
                    <Route path="syllabus" element={<Syllabus />} />
                    <Route path="chapter/:chapterId" element={<Chapter />} />
                    <Route path="chapter/:chapterId/cheatsheet" element={<CheatSheet />} />
                    <Route path="lesson/:sectionId" element={<Lesson />} />
                    <Route path="search" element={<Search />} />
                    <Route path="labs" element={<Labs />} />
                    <Route path="labs/python" element={<PythonLab />} />
                    <Route path="labs/logic" element={<LogicLab />} />
                    <Route path="labs/subnet" element={<SubnetLab />} />
                    <Route path="labs/debugger" element={<DebuggerLab />} />
                    <Route path="labs/sql" element={<SqlLab />} />
                    <Route path="practice" element={<A><Practice /></A>} />
                    <Route path="practice/session/:id" element={<A><QuizSession /></A>} />
                    <Route path="practice/written" element={<A><Written /></A>} />
                    <Route path="practice/written/:id" element={<A><WrittenQuestion /></A>} />
                    <Route path="practice/results/:id" element={<A><QuizResults /></A>} />
                    <Route path="revision" element={<A><Revision /></A>} />
                    <Route path="bookmarks" element={<A><Bookmarks /></A>} />
                    <Route path="planner" element={<A><Planner /></A>} />
                    <Route path="focus" element={<A><Focus /></A>} />
                    <Route path="assignments" element={<A><Assignments /></A>} />
                    <Route path="teach" element={<RequireRole level="teacher"><Teach /></RequireRole>} />
                    <Route path="teach/class/:classId" element={<RequireRole level="teacher"><TeachClass /></RequireRole>} />
                    <Route path="teach/assignment/:id" element={<RequireRole level="teacher"><TeachAssignment /></RequireRole>} />
                    <Route path="profile" element={<A><Profile /></A>} />
                    <Route path="admin" element={<RequireRole level="teacher"><AdminLayout /></RequireRole>}>
                      <Route index element={<AdminIndex />} />
                      <Route path="grading" element={<AdminGrading />} />
                      <Route path="content" element={<RequireRole level="staff"><AdminContent /></RequireRole>} />
                      <Route path="lesson/:sectionId" element={<RequireRole level="staff"><LessonEditor /></RequireRole>} />
                      <Route path="questions" element={<RequireRole level="staff"><AdminQuestions /></RequireRole>} />
                      <Route path="written" element={<RequireRole level="staff"><AdminWritten /></RequireRole>} />
                      <Route path="import" element={<RequireRole level="staff"><AdminImport /></RequireRole>} />
                      <Route path="users" element={<RequireRole level="admin"><AdminUsers /></RequireRole>} />
                      <Route path="audit" element={<RequireRole level="admin"><AdminAudit /></RequireRole>} />
                    </Route>
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </ProgressProvider>
        </CatalogProvider>
      </AuthProvider>
    </FeedbackProvider>
  );
}
