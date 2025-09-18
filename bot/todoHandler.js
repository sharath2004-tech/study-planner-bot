const db = require("../config/firebase");

async function handleTodoCommand(from, phone, text, sock) {
  const userRef = db.collection("users").doc(phone);
  const userDoc = await userRef.get();
  let todos = userDoc.exists ? userDoc.data().todos || [] : [];

  if (text.startsWith("todo add ")) {
    let task = text.slice(9).trim();
    todos.push({ task, done: false });
    await userRef.set({ todos }, { merge: true });
    return sock.sendMessage(from, { text: `✅ Added task: ${task}` });
  }

  if (text === "todo list") {
    if (todos.length === 0)
      return sock.sendMessage(from, { text: "📝 No tasks." });
    let list = todos.map((t, i) => `${i + 1}. ${t.done ? "✔️" : "❌"} ${t.task}`).join("\n");
    return sock.sendMessage(from, { text: "📝 Your To-Do List:\n" + list });
  }

  if (text.startsWith("done ")) {
    let num = parseInt(text.slice(5).trim());
    if (todos[num - 1]) {
      todos[num - 1].done = true;
      await userRef.set({ todos }, { merge: true });
      return sock.sendMessage(from, { text: `👏 Marked task ${num} as done!` });
    }
    return sock.sendMessage(from, { text: "⚠️ Invalid task number." });
  }
}

module.exports = handleTodoCommand;
