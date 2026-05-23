import { createRoot } from "react-dom/client";
import { createElement } from "react";
import "./style.css";
import { App } from "./App.jsx";

createRoot(document.getElementById("root")).render(createElement(App));
