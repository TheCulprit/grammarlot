# 🏰 Grammarlot

**Grammarlot** is a local development environment (IDE) and REST API server for **Parsifal**—a powerful Domain-Specific Language (DSL) designed for procedural text and AI prompt generation.

Whether you are generating complex, highly-variable prompts for image generators (like InvokeAI, ComfyUI, or Auto1111) or creating dynamic text systems, Grammarlot provides a seamless, modern web interface to write, test, and debug your logic in real-time.

---

## ✨ Features

- **📝 Modern Web IDE:** A sleek, obsidian-themed interface with resizable panels.
- **🧠 Smart Editor:** Features custom syntax highlighting, autocomplete, and real-time error linting for the Parsifal language.
- **📂 File Management:** Drag-and-drop file explorer. Drag files directly into the text editor to instantly insert `[file]` tags.
- **🔍 Trace Logs:** The Trace panel shows you the step-by-step logic the engine used to make its decisions.
- **🔌 REST API:** Runs a local backend server that your AI image generators can query to pull fresh, randomly generated prompts on the fly.
- **👻 Silent Background Mode:** Runs completely invisibly in your system tray without leaving terminal windows open on your desktop.

---

## 🚀 How to Run (For Users)

You do not need to install Python, Node, or any coding tools to use Grammarlot!

1. Go to the **Releases** page on the right side of this repository.
2. Download the latest version for your operating system (Windows `.exe`, Mac, or Linux).
3. Double-click the downloaded file. 
4. A golden castle icon will appear in your system tray/menu bar. Right-click it to open the IDE in your browser!

*(First-time setup: Click the ⚙️ Settings icon in the IDE and enter the path to the folder where you want to save your text files).*

---

## 🛠️ How to Develop (For Contributors)

If you want to edit the Grammarlot source code, you will need **Node.js/Yarn** and **uv** (the lightning-fast Python manager).

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/grammarlot.git
   cd grammarlot
   ```

2. **Install frontend dependencies:**
   ```bash
   yarn install
   ```

3. **Run the Hot-Reloading Dev Environment:**
   ```bash
   yarn dev
   ```
   *This command safely starts both the FastAPI backend and the Vite frontend simultaneously. Open your browser to `http://localhost:5173/`. When you save a file, the UI and Python server will both update instantly!*

4. **Building for Production:**
   If you want to test the standalone compiled version locally:
   ```bash
   cd frontend && yarn build
   cd ..
   uv run --directory backend python ../grammarlot.pyw
   ```

---

## 📜 What is Parsifal?
Parsifal is the text engine powering Grammarlot. It parses your text looking for `[commands]` to perform logic, math, and weighted randomness.

```text
[set is_fantasy]1[/set]

[if is_fantasy=="1"]
  A highly detailed digital painting of a [file name="characters/wizard.txt"].
  They are holding a [ran]glowing staff | dusty spellbook[/ran].
[/if]
```

### Parsifal Command Reference

#### File & Content Loading
- `[file name="path.txt"]` - Loads and evaluates the content of a specific file.
- `[wildcard name="path.txt"]` - Picks one random line from the specified file.
- `[all dir="folder_name"]` - Loads and evaluates every `.txt` file in a directory.

#### Variables & Math
- `[set name="var"]...[/set]` - Sets a variable to the evaluated inner text.
- `[override name="var"]...[/override]` - Sets an override variable (takes priority over `set`).
- `[get var="var_name"]` - Prints the value of a variable.
- `[exists var_name]` - Returns "1" if the variable exists, otherwise empty.
- `[contains val="string"]...[/contains]` - Returns "1" if the inner text contains the string.
- `[inc var_name]` / `[dec var_name]` - Increments or decrements a numeric variable by 1.
- `[calc]...[/calc]` - Evaluates the inner text as a mathematical expression (e.g., `[calc]5 + 5[/calc]`).
- `[len]...[/len]` - Returns the character length of the evaluated inner text.

#### Logic & Control Flow
- `[if var=="value"]...[/if]` - Evaluates inner text if the condition is met. 
- `[elseif var=="value"]...[/elseif]` - Chains after an `[if]`. Can also take a percentage: `[elseif 50%]`.
- `[else]...[/else]` - Chains after an `[if]` or `[elseif]`.
- `[switch var="var_name"]` - Opens a switch block.
  - `[case "value"]...[/case]` - Matches specific variable values inside a switch.
  - `[default]...[/default]` - The fallback for a switch statement.
- `[loop count="5"]...[/loop]` - Repeats the inner text a specific number of times.
- `[stop]` - Immediately halts all parsing and returns an empty string.
- `[break]` - Breaks out of the current block/loop.

#### Randomness & Selection
- `[chance 50%]...[/chance]` - Has a percentage chance of evaluating and outputting the inner text.
- `[ran count="1"]a | b | c[/ran]` - Picks a random item from a pipe-separated (or newline) list. 
- `[shuffle sep=", "]a | b | c[/shuffle]` - Randomizes the order of the list and joins them.
- `[range min max]` - Generates a random number between min and max.
- `[weighted]` - Container for weighted selections.
  - `[w 2.0]Option A[/w]` - An option inside a weighted block. Higher numbers are selected more frequently.

#### Formatting, Macros & Utility
- `[def name="macro_name"]...[/def]` - Defines a reusable macro.
- `[call name="macro_name"]` - Executes a previously defined macro.
- `[join sep=", "]a | b | c[/join]` - Joins a list together using the specified separator.
- `[ignore]...[/ignore]` - Outputs the inner text exactly as written without parsing.
- `[mute]...[/mute]` - Evaluates the inner text (processing sets/logic) but hides the final output.
- `[comment]...[/comment]` or `[#]...[/#]` - Developer comments. Completely ignored by the engine.
- `[rw min="1.1" max="1.5"]...[/rw]` - Wraps text in ComfyUI/Auto1111 random weighting: `(text:1.25)`.
- `[irw min="1.1" max="1.5"]...[/irw]` - Wraps text in InvokeAI random weighting: `(text)1.25`.

#### Registry System (Advanced)
- `[register tags="fantasy, weapon"]...[/register]` - Registers the inner text into the runtime database.
- `[select required="tag1" exclude="tag2" prefer="tag3"]` - Randomly selects and evaluates one item from the registry.
- `[query required="tag1" sep=", "]` - Finds *all* matching registry items, evaluates them, and joins them.
- `[count required="tag1"]` - Returns the number of matching items in the registry.
- `[intercept tags="tag1, tag2"]...[/intercept]` - Intercepts any `[select]` command rolling an item with these tags.
- `[pass]` - Used inside an intercept block to allow the candidate to evaluate normally.