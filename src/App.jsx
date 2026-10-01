import { useEffect, useMemo, useState } from "react";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { auth, db } from "./firebase";

const people = [
  {
    name: "Satwika",
    email: "satwika@90day.app",
  },
  {
    name: "Guest",
    email: "mohan@90day.app",
  },
  {
    name: "Mom",
    email: "mom@90day.app",
  },
  {
    name: "Dad",
    email: "dad@90day.app",
  },
];

const START_DATE = new Date(2026, 9, 1);
const END_DATE = new Date(2026, 11, 31);

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getChallengeDates() {
  const dates = [];
  const current = new Date(START_DATE);

  while (current <= END_DATE) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

const challengeDates = getChallengeDates();

function App() {
  const [selectedPerson, setSelectedPerson] = useState(people[0]);
  const [password, setPassword] = useState("");

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [tasks, setTasks] = useState([]);
  const [completions, setCompletions] = useState({});
  const [comments, setComments] = useState({});

 const initialDate = () => {
  const currentDate = formatDate(new Date());

  if (currentDate < formatDate(START_DATE)) {
    return formatDate(START_DATE);
  }

  if (currentDate > formatDate(END_DATE)) {
    return formatDate(END_DATE);
  }

  return currentDate;
};

const [selectedDate, setSelectedDate] = useState(initialDate);

  const [newTask, setNewTask] = useState("");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");

  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState("");
  const [celebration, setCelebration] = useState(false);

  /* ---------------- AUTH ---------------- */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setProfile(null);
        setTasks([]);
        setCompletions({});
        return;
      }

      setUser(currentUser);

      try {
        const userSnapshot = await getDocs(
          query(
            collection(db, "users"),
            where("__name__", "==", currentUser.uid),
          ),
        );

        if (!userSnapshot.empty) {
          setProfile(userSnapshot.docs[0].data());
        } else {
          setProfile({
            name: currentUser.email,
            email: currentUser.email,
          });
        }
      } catch (err) {
        console.error(err);

        setProfile({
          name: currentUser.email,
          email: currentUser.email,
        });
      }
    });

    return () => unsubscribe();
  }, []);

  /* ---------------- LOAD DATA ---------------- */

  useEffect(() => {
    if (!user) return;

    // eslint-disable-next-line react-hooks/immutability
    loadUserData();
  }, [user]);

  const loadUserData = async () => {
    setDataLoading(true);
    setError("");

    try {
      const tasksQuery = query(
        collection(db, "tasks"),
        where("userId", "==", user.uid),
      );

      const tasksSnapshot = await getDocs(tasksQuery);

      const loadedTasks = tasksSnapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

      setTasks(loadedTasks);

      const completionsQuery = query(
        collection(db, "completions"),
        where("userId", "==", user.uid),
      );

      const completionsSnapshot = await getDocs(completionsQuery);

      const loadedCompletions = {};

      completionsSnapshot.docs.forEach((item) => {
        const data = item.data();

        loadedCompletions[`${data.date}_${data.taskId}`] = {
          id: item.id,
          ...data,
        };
      });

      setCompletions(loadedCompletions);
    } catch (err) {
      console.error(err);
      setError("Unable to load your data.");
    } finally {
      setDataLoading(false);

      const commentsQuery = query(
        collection(db, "comments"),
        where("userId", "==", user.uid),
      );

      const commentsSnapshot = await getDocs(commentsQuery);

      const loadedComments = {};

      commentsSnapshot.docs.forEach((item) => {
        const data = item.data();

        loadedComments[`${data.date}_${data.taskId}`] = {
          id: item.id,
          ...data,
        };
      });

      setComments(loadedComments);
    }
  };

  /* ---------------- LOGIN ---------------- */

  const handleLogin = async (event) => {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, selectedPerson.email, password);

      setPassword("");
    } catch (err) {
      console.error(err);
      setError("Incorrect password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);

    setTasks([]);
    setCompletions({});
    setProfile(null);
    setUser(null);
  };

  /* ---------------- DATE HELPERS ---------------- */
  const now = new Date();
  const today = formatDate(now);

  const isPastDate = selectedDate < today;

  const selectedDayTasks = tasks.filter((task) => {
    const taskStartDate = task.startDate || formatDate(START_DATE);

    return taskStartDate <= selectedDate;
  });

  const selectedDayCompleted =
    selectedDayTasks.length > 0 &&
    selectedDayTasks.every((task) => {
      const key = `${selectedDate}_${task.id}`;

      return completions[key]?.completed;
    });

  const selectedDayLocked = isPastDate;

  /* ---------------- ADD TASK ---------------- */

  const handleAddTask = async (event) => {
    event.preventDefault();

    const title = newTask.trim();

    if (!title || !user) return;

    /*
     * Don't change historical days.
     */
    if (selectedDayLocked) {
      setError(
        "This day is completed and locked 🔒. You cannot change its goals.",
      );
      return;
    }

    try {
      const taskRef = await addDoc(collection(db, "tasks"), {
        userId: user.uid,
        title,
        startDate: selectedDate,
        createdAt: serverTimestamp(),
      });

      setTasks((previous) => [
        ...previous,
        {
          id: taskRef.id,
          userId: user.uid,
          title,
          startDate: selectedDate,
        },
      ]);

      setNewTask("");
    } catch (err) {
      console.error(err);
      setError("Could not add the goal.");
    }
  };

  /* ---------------- EDIT TASK ---------------- */

  const startEditing = (task) => {
    if (selectedDayLocked) {
      setError("This day is completed and locked. 🔒");
      return;
    }

    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
  };

  const cancelEditing = () => {
    setEditingTaskId(null);
    setEditingTaskTitle("");
  };

  const saveEditedTask = async (taskId) => {
    const title = editingTaskTitle.trim();

    if (!title) return;

    try {
      await updateDoc(doc(db, "tasks", taskId), {
        title,
      });

      setTasks((previous) =>
        previous.map((task) =>
          task.id === taskId ? { ...task, title } : task,
        ),
      );

      cancelEditing();
    } catch (err) {
      console.error(err);
      setError("Could not update the goal.");
    }
  };

  /* ---------------- DELETE TASK ---------------- */

  const handleDeleteTask = async (taskId) => {
    if (selectedDayLocked) {
      setError("This day is completed and locked.");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to delete this to-do?",
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteDoc(doc(db, "tasks", taskId));

      setTasks((previous) => previous.filter((task) => task.id !== taskId));

      setCompletions((previous) => {
        const updated = { ...previous };

        Object.keys(updated).forEach((key) => {
          if (updated[key].taskId === taskId) {
            delete updated[key];
          }
        });

        return updated;
      });
    } catch (err) {
      console.error(err);
      setError("Could not delete the goal.");
    }
  };

  const handleSaveComment = async (taskId, commentText) => {
    if (isPastDate) {
      setError("Past days are locked.");
      return;
    }

    if (!user) return;

    const text = commentText.trim();

    const key = `${selectedDate}_${taskId}`;
    const existingComment = comments[key];

    try {
      if (!text) {
        if (existingComment) {
          await deleteDoc(doc(db, "comments", existingComment.id));

          setComments((previous) => {
            const updated = { ...previous };
            delete updated[key];
            return updated;
          });
        }

        return;
      }

      if (existingComment) {
        await updateDoc(doc(db, "comments", existingComment.id), {
          comment: text,
        });

        setComments((previous) => ({
          ...previous,
          [key]: {
            ...previous[key],
            comment: text,
          },
        }));
      } else {
        const commentRef = await addDoc(collection(db, "comments"), {
          userId: user.uid,
          taskId,
          date: selectedDate,
          comment: text,
          createdAt: serverTimestamp(),
        });

        setComments((previous) => ({
          ...previous,
          [key]: {
            id: commentRef.id,
            userId: user.uid,
            taskId,
            date: selectedDate,
            comment: text,
          },
        }));
      }
    } catch (err) {
      console.error(err);
      setError("Could not save the comment.");
    }
  };

  /* ---------------- TOGGLE TASK ---------------- */

  const handleToggleTask = async (taskId) => {
    if (selectedDate > today) {
      setError("You cannot complete goals for a future day.");
      return;
    }

    if (isPastDate) {
      setError("Past days are locked.");
      return;
    }

    const key = `${selectedDate}_${taskId}`;
    const existingCompletion = completions[key];

    try {
      if (existingCompletion) {
        await deleteDoc(doc(db, "completions", existingCompletion.id));

        setCompletions((previous) => {
          const updated = { ...previous };
          delete updated[key];
          return updated;
        });

        return;
      }

      const completionRef = doc(collection(db, "completions"));

      await setDoc(completionRef, {
        userId: user.uid,
        taskId,
        date: selectedDate,
        completed: true,
      });

      setCompletions((previous) => ({
        ...previous,
        [key]: {
          id: completionRef.id,
          userId: user.uid,
          taskId,
          date: selectedDate,
          completed: true,
        },
      }));

      /*
       * Celebration when the whole day is completed.
       */
      const completedCount = selectedDayTasks.filter((task) => {
        if (task.id === taskId) return true;

        const taskKey = `${selectedDate}_${task.id}`;

        return completions[taskKey]?.completed;
      }).length;

      if (
        selectedDayTasks.length > 0 &&
        completedCount === selectedDayTasks.length
      ) {
        setCelebration(true);

        setTimeout(() => {
          setCelebration(false);
        }, 2500);
      }
    } catch (err) {
      console.error(err);
      setError("Could not update the goal.");
    }
  };

  /* ---------------- PROGRESS ---------------- */

  const selectedCompletedCount = selectedDayTasks.filter((task) => {
    const key = `${selectedDate}_${task.id}`;

    return completions[key]?.completed;
  }).length;

  const selectedProgress =
    selectedDayTasks.length === 0
      ? 0
      : Math.round((selectedCompletedCount / selectedDayTasks.length) * 100);

  const totalPossible = challengeDates.reduce((total, date) => {
    const dateString = formatDate(date);

    const activeTaskCount = tasks.filter((task) => {
      const taskStartDate = task.startDate || formatDate(START_DATE);

      return taskStartDate <= dateString;
    }).length;

    return total + activeTaskCount;
  }, 0);

  const totalCompleted = Object.values(completions).filter(
    (item) => item.completed,
  ).length;

  const overallProgress =
    totalPossible === 0
      ? 0
      : Math.round((totalCompleted / totalPossible) * 100);

  /* ---------------- STREAK ---------------- */

  const streak = useMemo(() => {
    let count = 0;

    let checkDate = new Date();

    checkDate.setHours(0, 0, 0, 0);

    if (checkDate < START_DATE) return 0;

    if (checkDate > END_DATE) {
      checkDate = new Date(END_DATE);
    }

    while (checkDate >= START_DATE) {
      const dateString = formatDate(checkDate);

      const activeTasks = tasks.filter((task) => {
        const taskStartDate = task.startDate || formatDate(START_DATE);

        return taskStartDate <= dateString;
      });

      if (activeTasks.length === 0) break;

      const completedForDay = activeTasks.filter((task) => {
        const key = `${dateString}_${task.id}`;

        return completions[key]?.completed;
      }).length;

      if (completedForDay === activeTasks.length) {
        count++;
      } else {
        break;
      }

      checkDate.setDate(checkDate.getDate() - 1);
    }

    return count;
  }, [tasks, completions]);

  /* ---------------- MOTIVATION ---------------- */

  let motivation = "Let's make today count. 💪";

  if (selectedDayTasks.length === 0) {
    motivation = "Add your first goal and let's get started. ✨";
  } else if (selectedProgress === 100) {
    motivation = "You did it! Everything is complete today. 🎉";
  } else if (selectedProgress >= 75) {
    motivation = "Almost there! Just a little more. 🔥";
  } else if (selectedProgress >= 50) {
    motivation = "You're halfway there. Keep going! 💪";
  } else if (selectedCompletedCount > 0) {
    motivation = "Great start! Keep the momentum going. ✨";
  }

  /* ---------------- LOGIN SCREEN ---------------- */

  if (!user) {
    return (
      <div className="app">
        <div className="login-container">
          <div className="login-card">
            <div className="logo-circle">90</div>

            <h1>90 Day Challenge</h1>

            <p className="login-subtitle">October 1 – December 31, 2026</p>

            <form onSubmit={handleLogin}>
              <label>Who are you?</label>

              <select
                value={selectedPerson.email}
                onChange={(event) => {
                  const person = people.find(
                    (item) => item.email === event.target.value,
                  );

                  setSelectedPerson(person);
                  setError("");
                }}
              >
                {people.map((person) => (
                  <option key={person.email} value={person.email}>
                    {person.name}
                  </option>
                ))}
              </select>

              <label>Password</label>

              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                required
              />

              {error && <div className="error-message">{error}</div>}

              <button
                className="primary-button"
                type="submit"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Start Challenge"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- DASHBOARD ---------------- */

  return (
    <div className="app">
      {celebration && (
        <div className="celebration">
          <div className="celebration-card">
            <div className="celebration-icon">✓</div>

            <h2>You did it! 🎉</h2>

            <p>
              Another day completed.
              <br />
              Keep the streak going!
            </p>
          </div>
        </div>
      )}

      <header className="topbar">
        <div>
          <div className="brand">90 Day Challenge</div>

          <div className="brand-subtitle">October 1 – December 31, 2026</div>
        </div>

        <div className="profile-area">
          <div className="profile-name">
            {profile?.name || selectedPerson.name}
          </div>

          <button className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard">
        {error && <div className="error-banner">{error}</div>}

        <section className="welcome-section">
          <div>
            <span className="eyebrow">
              DAY{" "}
              {Math.max(
                1,
                Math.floor((new Date() - START_DATE) / (1000 * 60 * 60 * 24)) +
                  1,
              )}{" "}
              OF 92
            </span>

            <h1>Hey, {profile?.name || selectedPerson.name} 👋</h1>

            <p>{motivation}</p>
          </div>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <span>🔥 Current streak</span>
            <strong>{streak}</strong>
            <small>days</small>
          </div>

          <div className="stat-card">
            <span>Today's progress</span>
            <strong>{selectedProgress}%</strong>
            <small>
              {selectedCompletedCount}/{selectedDayTasks.length}
            </small>
          </div>

          <div className="stat-card">
            <span>Overall progress</span>
            <strong>{overallProgress}%</strong>
            <small>challenge</small>
          </div>
        </section>

        <section className="main-todo-card">
          <div className="todo-header">
            <div>
              <span className="eyebrow">
                {isPastDate ? "COMPLETED DAY" : "TODAY'S GOALS"}
              </span>

              <h2>
                {new Date(`${selectedDate}T00:00:00`).toLocaleDateString(
                  "en-US",
                  {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  },
                )}
              </h2>

              <p>
                {selectedCompletedCount} of {selectedDayTasks.length} goals
                completed
                {selectedDayCompleted && " • Day completed "}
              </p>
            </div>

            <div
              className={`big-progress ${
                selectedProgress === 100 ? "finished" : ""
              }`}
            >
              {selectedProgress}%
            </div>
          </div>

          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${selectedProgress}%`,
              }}
            />
          </div>

          {!isPastDate && (
            <form className="add-task-form" onSubmit={handleAddTask}>
              <input
                value={newTask}
                onChange={(event) => setNewTask(event.target.value)}
                placeholder="What do you want to accomplish?"
              />

              <button type="submit">Add goal</button>
            </form>
          )}

          {dataLoading ? (
            <div className="empty-state">Loading your goals...</div>
          ) : selectedDayTasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">✦</div>

              <h3>No goals yet</h3>

              <p>Add your first goal for this challenge.</p>
            </div>
          ) : (
            <div className="task-list">
              {selectedDayTasks.map((task) => {
                const key = `${selectedDate}_${task.id}`;

                const completed = completions[key]?.completed;

                const isEditing = editingTaskId === task.id;

                return (
                  <div
                    className={`task-item ${completed ? "completed" : ""}`}
                    key={task.id}
                  >
                    <button
                      className={`task-checkbox ${completed ? "checked" : ""} ${
                        selectedDate > today ? "disabled" : ""
                      }`}
                      onClick={() => handleToggleTask(task.id)}
                      disabled={selectedDate > today}
                    >
                      {completed ? "✓" : ""}
                    </button>

                    {isEditing ? (
                      <input
                        className="edit-task-input"
                        value={editingTaskTitle}
                        onChange={(event) =>
                          setEditingTaskTitle(event.target.value)
                        }
                        autoFocus
                      />
                    ) : (
                      <div className="task-content">
                        {isEditing ? (
                          <input
                            className="edit-task-input"
                            value={editingTaskTitle}
                            onChange={(event) =>
                              setEditingTaskTitle(event.target.value)
                            }
                            autoFocus
                          />
                        ) : (
                          <span className="task-title">{task.title}</span>
                        )}

                        <div className="comment-section">
                          <textarea
                            className="comment-input"
                            placeholder="Add a comment..."
                            defaultValue={comments[key]?.comment || ""}
                            disabled={isPastDate}
                            onBlur={(event) =>
                              handleSaveComment(task.id, event.target.value)
                            }
                          />
                        </div>
                      </div>
                    )}

                    {!selectedDayLocked &&
                      (isEditing ? (
                        <div className="edit-actions">
                          <button
                            className="save-button"
                            onClick={() => saveEditedTask(task.id)}
                          >
                            Save
                          </button>

                          <button
                            className="cancel-button"
                            onClick={cancelEditing}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="task-actions">
                          <button
                            className="edit-button"
                            onClick={() => startEditing(task)}
                          >
                            ✎
                          </button>

                          <button
                            className="delete-task"
                            onClick={() => handleDeleteTask(task.id)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* DATE TIMELINE */}

        <section className="timeline-section">
          <div className="timeline-heading">
            <div>
              <span className="eyebrow">YOUR JOURNEY</span>

              <h2>92 days. One day at a time.</h2>
            </div>

            <p>Completed days are marked ✓</p>
          </div>

          <div className="date-timeline">
            {challengeDates.map((date) => {
              const dateString = formatDate(date);

              const activeTasks = tasks.filter((task) => {
                const taskStartDate = task.startDate || formatDate(START_DATE);

                return taskStartDate <= dateString;
              });

              const completedCount = activeTasks.filter((task) => {
                const key = `${dateString}_${task.id}`;

                return completions[key]?.completed;
              }).length;

              const isComplete =
                activeTasks.length > 0 && completedCount === activeTasks.length;

              const isSelected = dateString === selectedDate;

              const isToday = dateString === today;

              return (
                <button
                  key={dateString}
                  className={`timeline-day ${isSelected ? "selected" : ""} ${
                    isComplete ? "complete" : ""
                  } ${isToday ? "today" : ""}`}
                  onClick={() => setSelectedDate(dateString)}
                >
                  <span className="timeline-number">{date.getDate()}</span>

                  <span className="timeline-month">
                    {date.toLocaleDateString("en-US", {
                      month: "short",
                    })}
                  </span>

                  {isComplete && <span className="timeline-check">✓</span>}

                  {!isComplete && dateString < today && (
                    <span className="timeline-missed">—</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
