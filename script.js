class Slot {
  /**
   * @type {Component}
   */
  parentComponent;

  value = false;

  #cachedIndex;

  constructor(component) {
    this.parentComponent = component;
  }

  getIndex(list) {
    // Store the result since it shouldn't change anyway
    if (!this.#cachedIndex) {
      this.#cachedIndex = this.parentComponent[list].indexOf(this);
    }
    return this.#cachedIndex;
  }
}

class InputSlot extends Slot {
  /**
   * @type {Connection}
   */
  connection;

  constructor(component) {
    super(component);
  }

  getIndex() {
    return super.getIndex("inputs");
  }

  toggle() {
    this.setValue(!this.value);
  }

  setValue(state) {
    this.value = state;
    this.parentComponent.updateAndPropagate();
  }
}

class OutputSlot extends Slot {
  /**
   * Output connections
   * @type {Connection[]}
   */
  connections = [];

  constructor(component) {
    super(component);
  }

  getIndex() {
    return super.getIndex("outputs");
  }

  propagate() {
    for (let i = 0; i < this.connections.length; i++) {
      this.connections[i].propagate();
    }
  }

  // Makes a new mutual connection between the slots
  connectTo(targetInput, pathPoints) {
    new Connection(this, targetInput, pathPoints).establish();
  }
}

class Connection {
  /**
   * Source output
   * @type {OutputSlot}
   */
  sourceOutput;

  /**
   * Destination input
   * @type {InputSlot}
   */
  destInput;

  /**
   * Line turn points
   * @type {[x: Number, y: Number][]}
   */
  path = [];

  constructor(source, dest, pathPoints) {
    this.sourceOutput = source;
    this.destInput = dest;
    this.path = pathPoints ?? [];

    this.propagate();
  }

  static draw(ctx, start, end, pathPoints, value) {
    ctx.beginPath();
    ctx.lineCap = "round";
    ctx.lineWidth = 10;
    ctx.lineJoin = "round";
    ctx.strokeStyle = value ? theme.valueOn : theme.valueOff;
    ctx.moveTo(...start);
    for (let i = 0; i < pathPoints.length; i++) {
      ctx.lineTo(...pathPoints[i]);
    }
    ctx.lineTo(...end);

    ctx.stroke();
  }

  draw(ctx) {
    Connection.draw(
      ctx,
      this.sourceOutput.parentComponent.getOutputPosition(this.sourceOutput.getIndex()),
      this.destInput.parentComponent.getInputPosition(this.destInput.getIndex()),
      this.path,
      this.sourceOutput.value
    );
  }

  establish() {
    if (this.destInput.connection) this.destInput.connection.disconnect();
    this.sourceOutput.connections.push(this);
    this.destInput.connection = this;
    this.propagate();
  }

  disconnect() {
    this.sourceOutput.connections.splice(this.sourceOutput.connections.indexOf(this), 1);
    this.destInput.connection = null;
    this.destInput.value = false;
  }

  propagate() {
    const oldValue = this.destInput.value;
    if (this.sourceOutput.value !== oldValue) {
      this.destInput.value = this.sourceOutput.value;
      this.destInput.parentComponent.updateAndPropagate();
    }
  }
}

class Component {
  type = "generic";

  sizing = 32;

  label = "";
  x = 0;
  y = 0;
  actualX = 0;
  actualY = 0;
  width = 80;
  height = this.sizing;

  /**
   * Input slots
   * @type {InputSlot[]}
   */
  inputs = [];

  /**
   * Output slots
   * @type {OutputSlot[]}
   */
  outputs = [];

  constructor(name, evaluateFunc, numInputs = 2, numOutputs = 1) {
    this.type = name;
    this.label = name;
    this.inputs = Array.from({ length: numInputs }, () => new InputSlot(this));
    this.outputs = Array.from({ length: numOutputs }, () => new OutputSlot(this));
    this.evaluate = evaluateFunc;
    this.width = Math.min(Math.max(80, Math.ceil((this.label.length * 16 + 24) / 16) * 16), 192);
    this.height = Math.max(this.inputs.length * this.sizing, this.outputs.length * this.sizing, this.sizing);
    this.update();
  }

  setPosition(x, y, actual) {
    this.x = x ?? 0;
    this.y = y ?? 0;
    if (actual) {
      this.actualX = this.x;
      this.actualY = this.y;
    }
  }

  // Returns a duplicate of self
  clone() {
    return new this.constructor(this.label, this.evaluate, this.inputs.length, this.outputs.length);
  }

  /**
   * Returns output value(s) based on some criteria on the inputs.
   * To be implemented by instances and extending classes.
   *
   * @param {Boolean[]} inputs
   * @returns {Boolean[]}
   */
  evaluate(inputs) {}

  update() {
    const result = this.evaluate(this.inputs.map((i) => i.value)) ?? [];
    for (let i = 0; i < Math.min(this.outputs.length, result.length); i++) {
      this.outputs[i].value = result[i];
    }
  }

  propagateOutputs() {
    for (let i = 0; i < this.outputs.length; i++) this.outputs[i].propagate();
  }

  updateAndPropagate() {
    this.update();
    this.propagateOutputs();
  }

  getInputIndexAtY(y) {
    return Math.round((y - this.height / this.inputs.length / 2) / (this.height / this.inputs.length));
  }

  getInputAtY(y) {
    return this.inputs[this.getInputIndexAtY(y)];
  }

  getOutputIndexAtY(y) {
    return Math.round((y - this.height / this.outputs.length / 2) / (this.height / this.outputs.length));
  }

  getOutputAtY(y) {
    return this.outputs[this.getOutputIndexAtY(y)];
  }

  getInputPosition(n) {
    return [this.x, this.y + ((this.height / this.inputs.length) * n + this.height / this.inputs.length / 2)];
  }

  getOutputPosition(n) {
    return [this.x + this.width, this.y + ((this.height / this.outputs.length) * n + this.height / this.outputs.length / 2)];
  }

  getAllConnections() {
    return [...this.inputs.map((i) => i.connection), ...this.outputs.map((o) => o.connections).flat()].filter((v) => v != null);
  }

  dismember() {
    this.getAllConnections().forEach((c) => c.disconnect());
  }

  /**
   *
   * @param {CanvasRenderingContext2D} ctx the canvas context to use
   */
  draw(ctx) {
    ctx.font = this.sizing + "px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.beginPath();
    ctx.fillStyle = theme.componentFace;
    ctx.roundRect(this.x, this.y, this.width, this.height, 8);
    ctx.fill();

    ctx.fillStyle = theme.componentText;
    ctx.fillText(this.label, this.x + this.width / 2, this.y + this.height / 2, this.width);

    // Drawing inputs
    for (let i = 0; i < this.inputs.length; i++) {
      ctx.beginPath();
      ctx.arc(...this.getInputPosition(i), 8, 0, Math.PI * 2);
      ctx.fillStyle = this.inputs[i].value ? theme.valueOn : theme.valueOff;
      ctx.fill();
    }

    // Drawing outputs
    for (let oi = 0; oi < this.outputs.length; oi++) {
      const output = this.outputs[oi];
      ctx.beginPath();
      const position = this.getOutputPosition(oi);
      ctx.arc(...position, 8, 0, Math.PI * 2);
      ctx.fillStyle = output.value ? theme.valueOn : theme.valueOff;
      ctx.fill();

      // Drawing connections
      for (let ci = 0; ci < output.connections.length; ci++) {
        output.connections[ci].draw(ctx);
      }
    }
  }

  toPersistenceObject() {
    return {
      type: this.type,
      x: this.actualX ?? this.x,
      y: this.actualY ?? this.y,
    };
  }

  /**
   * Renders an image of the component
   * @param {Number} resolution the minimum image dimension length
   * @returns {String} data url of the image
   */
  getSelfPortrait(resolution = 256) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const ratio = (this.width + 16) / this.height;

    canvas.width = Math.max(resolution, resolution * ratio);
    canvas.height = Math.max(resolution, resolution / ratio);

    ctx.scale(canvas.width / (this.width + 16), canvas.height / this.height);
    ctx.translate(8, 0);

    this.draw(ctx);

    const image = canvas.toDataURL();

    canvas.remove();

    return image;
  }
}

class GlobalInput extends Component {
  sizing = 32;
  constructor() {
    super("input", (inputs) => [inputs[0]], 1, 1);
    this.width = this.sizing;
    this.height = this.sizing;
  }

  set value(value) {
    this.inputs[0].setValue(value);
  }

  getOutputPosition(n) {
    return [this.x + this.width / 2, this.y + this.height / 2];
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.sizing / 2, Math.PI * 0.25, Math.PI * 1.75);
    ctx.lineTo(this.x + this.width / 2, this.y + this.height / 2);
    ctx.fillStyle = this.inputs[0].value ? theme.valueOn : theme.valueOff;
    ctx.fill();
    for (let i = 0; i < this.outputs[0].connections.length; i++) {
      this.outputs[0].connections[i].draw(ctx);
    }
  }
}

class GlobalOutput extends Component {
  sizing = 32;
  constructor() {
    super("output", (inputs) => [inputs[0]], 1, 1);
    this.width = this.sizing;
    this.height = this.sizing;
  }

  get value() {
    return this.outputs[0].value;
  }

  getInputPosition(n) {
    return [this.x + this.width / 2, this.y + this.height / 2];
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.sizing / 2, Math.PI * 0.75, Math.PI * 1.25, true);
    ctx.lineTo(this.x + this.width / 2, this.y + this.height / 2);
    ctx.fillStyle = this.inputs[0].value ? theme.valueOn : theme.valueOff;
    ctx.fill();
  }
}

const defaultComponents = {
  input: new GlobalInput(),
  output: new GlobalOutput(),
  is: new Component("is", (inputs) => [inputs[0]], 1),
  and: new Component("and", (inputs) => [inputs.every((b) => b === true)]),
  or: new Component("or", (inputs) => [inputs.some((b) => b === true)]),
  xor: new Component("xor", (inputs) => [inputs.indexOf(true) === inputs.lastIndexOf(true) && inputs.indexOf(true) !== -1]),
  not: new Component("not", (inputs) => [!inputs[0]], 1),
  nand: new Component("nand", (inputs) => [inputs.some((b) => b === false)]),
  nor: new Component("nor", (inputs) => [inputs.every((b) => b === false)]),
  xnor: new Component("xnor", (inputs) => [!(inputs.indexOf(true) === inputs.lastIndexOf(true) && inputs.indexOf(true) !== -1)]),
};

class Circuit {
  inputs = [];
  outputs = [];

  /**
   * All components in the workspace
   * @type {Component[]}
   */
  components = [];

  constructor() {}

  addComponent(component, x, y) {
    component.id = this.components.push(component);
    if (component.type === "input") this.inputs.push(component);
    else if (component.type === "output") this.outputs.push(component);

    component.setPosition(x, y, true);
  }

  removeComponent(component) {
    component.dismember();
    this.components.splice(this.components.indexOf(component), 1);
    if (component.type === "input") this.inputs.splice(this.components.indexOf(component), 1);
    else if (component.type === "output") this.outputs.splice(this.components.indexOf(component), 1);
  }

  process(inputs = []) {
    for (let i = 0; i < this.inputs.length; i++) {
      if (inputs[i] !== undefined) this.inputs[i].value = inputs[i];
      this.inputs[i].propagateOutputs();
    }
    return this.outputs.map((o) => o.outputs[0].value);
  }

  clone() {
    const result = new Circuit();
    const map = new WeakMap();
    for (let i = 0; i < this.components.length; i++) {
      const component = this.components[i];
      const copy = component.clone();
      map.set(component, copy);
      result.addComponent(copy);
    }

    for (let c = 0; c < this.components.length; c++) {
      const component = this.components[c];
      for (let o = 0; o < component.outputs.length; o++) {
        const output = component.outputs[o];
        for (let n = 0; n < output.connections.length; n++) {
          const connection = output.connections[n];
          map.get(component).outputs[o].connectTo(map.get(connection.destInput.parentComponent).inputs[connection.destInput.getIndex()]);
        }
      }
    }

    return result;
  }

  clear() {
    this.components = [];
    this.inputs = [];
    this.outputs = [];
  }

  populate(components) {
    this.clear();
    components.forEach((c) => this.addComponent(c, c.actualX, c.actualY));
  }

  /**
   * @returns {Connection[]}
   */
  getAllConnections() {
    return [...new Set(this.components.map((c) => c.getAllConnections()).flat())];
  }

  toPersistenceObject() {
    return {
      components: this.components.map((c) => c.toPersistenceObject()),
      connections: this.getAllConnections().map((c) => ({
        from: [this.components.indexOf(c.sourceOutput.parentComponent), c.sourceOutput.getIndex()],
        to: [this.components.indexOf(c.destInput.parentComponent), c.destInput.getIndex()],
        path: c.path,
      })),
    };
  }

  loadPersistenceObject(object) {
    this.clear();

    object.components.forEach((c) => {
      if (c.type === "custom") this.addComponent(CustomComponent.fromPersistenceObject(c), c.x, c.y);
      else this.addComponent(defaultComponents[c.type].clone(), c.x, c.y);
    });
    object.connections.forEach((c) => this.components[c.from[0]].outputs[c.from[1]].connectTo(this.components[c.to[0]].inputs[c.to[1]], c.path));
  }

  static fromPersistenceObject(object) {
    const circuit = new Circuit();
    circuit.loadPersistenceObject(object);
    return circuit;
  }

  toCustomComponent(name) {
    return new CustomComponent(name, this);
  }
}

class CustomComponent extends Component {
  constructor(label, circuit) {
    super(label, () => {}, circuit.inputs.length, circuit.outputs.length);
    this.circuit = circuit.clone();
    this.evaluate = (inputs) => this.circuit.process(inputs);
    this.type = "custom";
  }
  clone() {
    return new CustomComponent(this.label, this.circuit);
  }

  toPersistenceObject() {
    const object = super.toPersistenceObject();
    object.name = this.label;
    object.circuit = this.circuit.toPersistenceObject();
    return object;
  }

  static fromPersistenceObject(object) {
    const instance = new this(object.name, Circuit.fromPersistenceObject(object.circuit));
    instance.setPosition(object.x, object.y, true);
    return instance;
  }
}

class EasedAnimation {
  constructor(subject, property, targetValue, length, easingFunc = (t) => t, endCallback = () => {}) {
    this.subject = subject;
    this.property = property;
    this.initialValue = subject[property];
    this.targetValue = targetValue;
    this.startTime = performance.now();
    this.length = length;
    this.easingFunc = easingFunc;
    this.endCallback = endCallback ?? (() => {});
  }

  tick(timestamp = performance.now()) {
    const time = timestamp - this.startTime;
    if (time > this.length) {
      this.finish();
      return;
    }
    this.subject[this.property] = this.initialValue + this.easingFunc(time / this.length) * (this.targetValue - this.initialValue);
  }

  abort() {
    this.subject[this.property] = this.initialValue;
  }

  finish() {
    this.subject[this.property] = this.targetValue;
    this.endCallback?.();
  }
}

class Command {
  constructor() {}
  execute() {}
  reverse() {}
}

class HistoryManager {
  /**
   * @type {Command[]}
   */
  undoStack = [];

  /**
   * @type {Command[]}
   */
  redoStack = [];

  constructor(sideEffect) {
    this.sideEffect = sideEffect ?? (() => {});
  }

  execute(command) {
    command.execute();
    this.add(command);
  }

  add(command) {
    this.undoStack.push(command);
    this.redoStack = [];
    this.sideEffect?.();
  }

  undo() {
    if (this.undoStack.length > 0) {
      const command = this.undoStack.pop();
      command.reverse();
      this.redoStack.push(command);
      this.sideEffect?.();
    }
  }

  redo() {
    if (this.redoStack.length > 0) {
      const command = this.redoStack.pop();
      command.execute();
      this.undoStack.push(command);
      this.sideEffect?.();
    }
  }
}

class AddComponentCommand extends Command {
  constructor(workspace, component, x, y) {
    super();
    this.workspace = workspace;
    this.component = component;
    this.x = x;
    this.y = y;
  }

  execute() {
    workspace.addComponent(this.component, this.x, this.y);
  }

  reverse() {
    workspace.removeComponent(this.component);
  }
}

class RemoveComponentCommand extends Command {
  constructor(workspace, component) {
    super();
    this.workspace = workspace;
    this.component = component;
    this.connections = component.getAllConnections();
  }

  execute() {
    this.workspace.removeComponent(this.component);
  }

  reverse() {
    this.workspace.addComponent(this.component, this.component.actualX, this.component.actualY);
    for (let i = 0; i < this.connections.length; i++) this.connections[i].establish();
  }
}

class ClearCommand extends Command {
  constructor(workspace) {
    super();
    this.workspace = workspace;
    this.components = workspace.components;
  }

  execute() {
    this.workspace.clear();
  }

  reverse() {
    workspace.populate(this.components);
  }
}

class PopulateCommand extends Command {
  constructor(workspace, newComponents, oldComponents) {
    super();
    this.workspace = workspace;
    this.newComponents = newComponents;
    this.oldComponents = oldComponents ?? workspace.components;
  }

  execute() {
    this.workspace.populate(this.newComponents);
  }

  reverse() {
    this.workspace.populate(this.oldComponents);
  }
}

class MoveComponentCommand extends Command {
  constructor(workspace, component, toX, toY, fromX, fromY) {
    super();
    this.workspace = workspace;
    this.component = component;
    this.fromX = fromX ?? component.actualX;
    this.fromY = fromY ?? component.actualY;
    this.toX = toX;
    this.toY = toY;
  }

  execute() {
    this.workspace.moveComponent(this.component, this.toX, this.toY);
  }

  reverse() {
    this.workspace.moveComponent(this.component, this.fromX, this.fromY);
  }
}

class ConnectCommand extends Command {
  constructor(...connections) {
    super();
    this.connections = connections;
  }

  execute() {
    this.connections.forEach((c) => c.establish());
  }

  reverse() {
    this.connections.forEach((c) => c.disconnect());
  }
}

class DisconnectCommand extends Command {
  constructor(...connections) {
    super();
    this.connections = connections;
  }

  execute() {
    this.connections.forEach((c) => c.disconnect());
  }

  reverse() {
    this.connections.forEach((c) => c.establish());
  }
}

class Workspace extends Circuit {
  scale = devicePixelRatio || 1;

  showGrid = true;
  gridMode = "CSS";

  zoom = 1;
  panX = 0;
  panY = 0;

  gridSize = 16;

  isPanning = false;

  /**
   * The component currently being dragged
   * @type {Component}
   */
  draggedComponent = null;

  /**
   * The output currently being dragged and connected
   * @type {OutputSlot}
   */
  connectingOutputSlot = null;

  connectingPath = [];

  /**
   * Canvas rendering context
   * @type {CanvasRenderingContext2D}
   */
  ctx;

  /**
   * @type {EasedAnimation[]}
   */
  animationQueue = [];

  _pointerX = 0;
  _pointerY = 0;

  constructor(name, canvas) {
    super();
    this.name = name;
    this.history = new HistoryManager(() => this.saveToStorage());
    this.ctx = canvas.getContext("2d");
    this.initializeCanvas();
    this.loadFromStorage();
  }

  saveToStorage() {
    localStorage.setItem(this.name + "_workspace", JSON.stringify(this.toPersistenceObject()));
  }

  loadFromStorage() {
    const data = localStorage.getItem(this.name + "_workspace");
    if (data) this.loadPersistenceObject(JSON.parse(data));
  }

  animate(subject, property, targetValue, length, easingFunc, endCallback) {
    const that = this;
    this.animationQueue.push(
      new EasedAnimation(subject, property, targetValue, length, easingFunc, function () {
        let index = that.animationQueue.indexOf(this);
        if (index !== -1) that.animationQueue.splice(index, 1); // Dispose the animation
        endCallback?.();
      })
    );
    this.draw(performance.now(), true);
  }

  // Unused
  worldToScreen(x, y) {
    return [
      this.ctx.canvas.width / 2 + this.panX * this.zoom * this.scale + x * this.zoom * this.scale,
      this.ctx.canvas.height / 2 + this.panY * this.zoom * this.scale + y * this.zoom * this.scale,
    ];
  }

  screenToWorld(x, y) {
    return [(x * this.scale - this.ctx.canvas.width / 2 - this.panX * this.zoom) / this.zoom, (y * this.scale - this.ctx.canvas.height / 2 - this.panY * this.zoom) / this.zoom];
  }

  getComponentAt(x, y) {
    const slotMargin = 10;
    for (let i = this.components.length - 1; i >= 0; i--) {
      const c = this.components[i];

      const inputMargin = slotMargin * (c.inputs.length > 0);
      const outputMargin = slotMargin * (c.outputs.length > 0);

      if (x >= c.x - inputMargin && x <= c.x + c.width + outputMargin && y >= c.y && y <= c.y + c.height) {
        return c;
      }
    }
  }

  addComponent(...args) {
    super.addComponent(...args);
    this.draw();
  }

  removeComponent(...args) {
    super.removeComponent(...args);
    this.draw();
  }

  moveComponent(component, x, y, animate = true) {
    component.actualX = x;
    component.actualY = y;
    if (animate) {
      this.animate(component, "x", Math.round(x / this.gridSize) * this.gridSize, 100, (t) => -(Math.cos(Math.PI * t) - 1) / 2);
      this.animate(component, "y", Math.round(y / this.gridSize) * this.gridSize, 100, (t) => -(Math.cos(Math.PI * t) - 1) / 2);
    } else {
      component.setPosition(x, y);
    }
  }

  downloadJson() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(this.toPersistenceObject())], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = this.name + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  loadJsonFile(makeHistory = false) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";

    input.addEventListener("input", (e) => {
      const file = e.target.files[0];

      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const object = JSON.parse(e.target.result);
            const oldComponents = [...this.components];
            this.loadPersistenceObject(object);
            this.history.add(new PopulateCommand(this, this.components, oldComponents));
            this.draw();
          } catch (error) {
            alert("Error reading file: " + error);
          }
        };
        reader.readAsText(file);
      }
    });

    input.click();
    input.remove();
  }

  /**
   * Adds event listeners and readies the canvas
   */
  initializeCanvas() {
    // Scale everything by the CSS pixel ratio to make the canvas crisp on high DPI screens
    this.scale = devicePixelRatio || 1;

    const updateGrid = () => {
      this.ctx.canvas.style.backgroundSize = `${this.gridSize * (this.zoom / this.scale)}px ${this.gridSize * (this.zoom / this.scale)}px`;
      // this.ctx.canvas.style.backgroundPosition = `${this.ctx.canvas.width / scale / 2 + this.panX * (this.zoom / scale)}px ${this.ctx.canvas.height / scale / 2 + this.panY * (this.zoom / scale)}px`;
      this.ctx.canvas.style.backgroundPosition = `${this.ctx.canvas.width / this.scale / 2 + (this.panX + this.gridSize / 2) * (this.zoom / this.scale)}px
                                                  ${this.ctx.canvas.height / this.scale / 2 + (this.panY + this.gridSize / 2) * (this.zoom / this.scale)}px`;

      this.draw();
    };

    const resizeCanvas = () => {
      this.scale = devicePixelRatio || 1;
      const rect = this.ctx.canvas.getBoundingClientRect();
      this.ctx.canvas.width = rect.width * this.scale;
      this.ctx.canvas.height = rect.height * this.scale;
      updateGrid();
    };

    this.zoom = this.scale;

    resizeCanvas();
    updateGrid();

    const mQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    mQuery.addEventListener("change", resizeCanvas);

    window.addEventListener("resize", resizeCanvas.bind(this));

    this.ctx.canvas.addEventListener(
      "wheel",
      (e) => {
        this.zoom += ((-e.deltaY / 100) * this.zoom) / 5;
        this.zoom = Math.min(5, Math.max(0.2, this.zoom));
        updateGrid();
      },
      { passive: true } // to shut up devtools
    );

    let lastX = 0;
    let lastY = 0;

    let dragStartX = 0;
    let dragStartY = 0;

    this.ctx.canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;

      let [x, y] = this.screenToWorld(e.offsetX, e.offsetY);
      [this._pointerX, this._pointerY] = [x, y];
      const target = this.getComponentAt(x, y);

      if (target) {
        const relativeX = x - target.x;
        const relativeY = y - target.y;

        if (relativeX < 12) {
          const targetInput = target.getInputAtY(relativeY);
          if (targetInput.connection) {
            targetInput.connection.disconnect();
          } else {
            targetInput.toggle();
          }
          this.draw();
        } else if (relativeX > target.width - 12 && target.type !== "output") {
          this.connectingOutputSlot = target.getOutputAtY(relativeY);
        } else {
          this.draggedComponent = target;
          dragStartX = target.x;
          dragStartY = target.y;
        }
        if ((target.type === "input" || target.type === "output") && !this.connectingOutputSlot) {
          this.draggedComponent = target;
        }
      } else {
        this.isPanning = true;
      }

      [lastX, lastY] = [e.clientX, e.clientY];
    });

    // Listening on document to account for accidental movement outside the canvas
    document.addEventListener("pointermove", (e) => {
      const point = this.screenToWorld(e.clientX, e.clientY); // Assuming the canvas is at 0, 0
      [this._pointerX, this._pointerY] = point; // Store the current cursor position for use in draw()
      const [deltaX, deltaY] = [(e.clientX - lastX) * this.scale, (e.clientY - lastY) * this.scale];

      if (this.connectingOutputSlot) {
        const origin = this.connectingOutputSlot.parentComponent.getOutputPosition(this.connectingOutputSlot.getIndex());
        const last = this.connectingPath[this.connectingPath.length - 1] ?? origin;

        const axis = this.connectingPath.length % 2 ? 1 : 0;
        const comp = this.connectingPath.length % 2 ? 0 : 1; // Complementary - perpendicular axis

        // Add a point when the cursor takes a 90-degree turn
        if (Math.abs(point[comp] - last[comp]) >= this.gridSize * 0.75) {
          const newPoint = new Array(2);
          newPoint[axis] = Math.round(point[axis] / this.gridSize) * this.gridSize;
          newPoint[comp] = last[comp];
          if (last[axis] === newPoint[axis] && this.connectingPath.length > 0) {
            this.connectingPath.pop(); // Remove the last point if the cursor backtracks to it again
          } else {
            this.connectingPath.push(newPoint); // If not, add a new point there
          }
        }

        this.draw();
      } else if (this.draggedComponent) {
        this.draggedComponent.x += deltaX / this.zoom;
        this.draggedComponent.y += deltaY / this.zoom;
        this.draw();
      } else if (this.isPanning) {
        this.panX += deltaX / this.zoom;
        this.panY += deltaY / this.zoom;
        updateGrid();
      }

      [lastX, lastY] = [e.clientX, e.clientY];
    });

    document.addEventListener("pointerup", (e) => {
      if (this.connectingOutputSlot) {
        let [x, y] = this.screenToWorld(e.offsetX, e.offsetY);

        const target = this.getComponentAt(x, y);

        if (target && target !== this.connectingOutputSlot.parentComponent && target.type !== "input") {
          const relativeY = y - target.y;
          const targetInput = target.getInputAtY(relativeY);

          if (targetInput) {
            this.history.execute(new ConnectCommand(new Connection(this.connectingOutputSlot, targetInput, this.connectingPath)));
          }
        }
      } else if (this.draggedComponent) {
        const pos = [Math.round(this.draggedComponent.x / this.gridSize) * this.gridSize, Math.round(this.draggedComponent.y / this.gridSize) * this.gridSize];
        if (this.draggedComponent.new) {
          this.moveComponent(this.draggedComponent, ...pos);
          this.draggedComponent.createCommand.x = pos[0];
          this.draggedComponent.createCommand.y = pos[1];
          this.history.add(this.draggedComponent.createCommand);
          delete this.draggedComponent.new;
          delete this.draggedComponent.createCommand;
        } else {
          this.history.execute(new MoveComponentCommand(this, this.draggedComponent, pos[0], pos[1], dragStartX, dragStartY));
        }
      }

      this.connectingOutputSlot = null;
      this.connectingPath = [];
      this.isPanning = false;
      this.draggedComponent = null;

      this.draw();
    });

    this.ctx.canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const point = this.screenToWorld(e.clientX, e.clientY);
      const targetComponent = this.getComponentAt(...point);
      if (targetComponent) {
        const menu = [
          {
            text: "Duplicate",
            action: () => this.history.execute(new AddComponentCommand(this, targetComponent.clone(), ...point)),
          },
          {
            text: "Disconnect",
            action: () => this.history.execute(new DisconnectCommand(targetComponent.getAllConnections())),
          },
          {
            text: "Remove",
            action: () => this.history.execute(new RemoveComponentCommand(this, targetComponent)),
          },
        ];
        contextMenu(menu, e.clientX, e.clientY);
      } else {
        const menu = [
          {
            text: "Save to Disk",
            hint: "ctrl + s",
            action: () => this.downloadJson(),
          },
          {
            text: "Load from Disk",
            hint: "ctrl + o",
            action: () => this.loadJsonFile(true),
          },
          {
            text: "Convert to Component",
            action: () => {
              const component = this.toCustomComponent(prompt("Component name:", "custom"));
              registerCustomComponent(component);
              this.history.execute(new AddComponentCommand(this, component, ...point));
            },
            disabled: this.inputs.length < 1 || this.outputs.length < 1,
          },
          {
            text: "Undo",
            hint: "ctrl + z",
            action: () => this.history.undo(),
            disabled: this.history.undoStack.length === 0,
          },
          {
            text: "Redo",
            hint: "ctrl + y",
            action: () => this.history.redo(),
            disabled: this.history.redoStack.length === 0,
          },
          {
            text: "Clear",
            hint: "ctrl + shift + d",
            action: () => this.history.execute(new ClearCommand(this)),
          },
          {
            divider: true,
          },
          {
            text: "Toggle Grid",
            hint: "ctrl + g",
            action: () => this.ctx.canvas.classList.toggle("grid"),
          },
        ];

        contextMenu(menu, e.clientX, e.clientY);
      }
    });

    const keyBinds = {
      "ctrl+s": () => this.downloadJson(),
      "ctrl+o": () => this.loadJsonFile(),
      "ctrl+z": () => this.history.undo(),
      "ctrl+y": () => this.history.redo(),
      "ctrl+g": () => this.ctx.canvas.classList.toggle("grid"),
      "ctrl+shift+d": () => this.history.execute(new ClearCommand(this)),
    };

    document.addEventListener("keydown", (e) => {
      for (const keyCombo in keyBinds) {
        const keys = keyCombo.split("+");

        if (
          (e.ctrlKey && !keys.includes("ctrl")) ||
          (e.shiftKey && !keys.includes("shift")) ||
          (e.altKey && !keys.includes("alt")) ||
          (e.metaKey && !keys.includes("win")) ||
          !keys.includes(e.key)
        ) {
          continue;
        }

        e.preventDefault();
        keyBinds[keyCombo]();
        this.draw();
      }
    });
  }

  tickAnimations(timestamp) {
    for (let i = 0; i < this.animationQueue.length; i++) this.animationQueue[i].tick(timestamp);
  }

  draw(timestamp = performance.now(), loop = false) {
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

    this.tickAnimations(timestamp);

    if (this.gridMode === "Canvas") {
      this.ctx.strokeStyle = theme.grid;
      this.ctx.lineWidth = 1;

      for (let x = (this.ctx.canvas.width / 2 + this.panX * this.zoom) % (this.gridSize * this.zoom); x < this.ctx.canvas.width; x += this.gridSize * this.zoom) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, this.ctx.canvas.height);
        this.ctx.stroke();
      }

      for (let y = (this.ctx.canvas.height / 2 + this.panY * this.zoom) % (this.gridSize * this.zoom); y < this.ctx.canvas.height; y += this.gridSize * this.zoom) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(this.ctx.canvas.width, y);
        this.ctx.stroke();
      }
    }

    this.ctx.save();
    this.ctx.translate(this.ctx.canvas.width / 2 + this.panX * this.zoom, this.ctx.canvas.height / 2 + this.panY * this.zoom);
    this.ctx.scale(this.zoom, this.zoom);

    for (const component of this.components) {
      component.draw(this.ctx);
    }

    if (this.connectingOutputSlot) {
      const last = this.connectingPath[this.connectingPath.length - 1] ?? this.connectingOutputSlot.parentComponent.getOutputPosition(this.connectingOutputSlot.getIndex());
      Connection.draw(
        this.ctx,
        this.connectingOutputSlot.parentComponent.getOutputPosition(this.connectingOutputSlot.getIndex()),
        this.connectingPath.length % 2 ? [last[0], this._pointerY] : [this._pointerX, last[1]],
        this.connectingPath,
        this.connectingOutputSlot.value
      );
    }

    this.ctx.restore();

    // To avoid the draw function being called more than once a frame when called normally
    if (this.animationQueue.length > 0 && loop) requestAnimationFrame(() => this.draw(performance.now(), true));
  }
}

var theme = {
  componentFace: "#46d",
  componentText: "#fff",
  valueOff: "#f00",
  valueOn: "#0f0",
  grid: "#6663",
};

function contextMenu(menu, x, y) {
  document.querySelector(".context-menu")?.remove();
  const list = document.createElement("ul");
  list.className = "context-menu";
  list.oncontextmenu = (e) => e.preventDefault();

  for (let i = 0; i < menu.length; i++) {
    const item = menu[i];

    if (item.divider) {
      list.appendChild(document.createElement("hr"));
      continue;
    }

    const li = document.createElement("li");
    li.textContent = item.text;

    if (item.hint) {
      const hint = document.createElement("small");
      hint.textContent = item.hint;
      li.appendChild(hint);
    }

    if (item.disabled) {
      li.classList.add("disabled");
      li.inert = true;
    }

    li.addEventListener("pointerup", () => {
      item.action();
      if (!item.persist) {
        list.remove();
      }
    });

    list.appendChild(li);
  }

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.target.parentElement !== list && e.target !== list) {
        list.remove();
      }
    },
    { once: true }
  );

  list.style.left = x + "px";
  list.style.top = y + "px";

  document.body.appendChild(list);

  const rect = list.getBoundingClientRect();

  let finalX = x;
  let finalY = y;

  if (rect.right > innerWidth) {
    finalX = x - rect.width;
  }
  if (finalX < 0) {
    finalX = 0;
  }

  if (rect.bottom > innerHeight) {
    finalY = y - rect.height;
  }
  if (finalY < 0) {
    finalY = 0;
  }

  list.style.left = finalX + "px";
  list.style.top = finalY + "px";

  // Start animation from the given position regardless of the final menu position
  list.style.transformOrigin = ((x - list.offsetLeft) / rect.width) * 100 + "% " + ((y - list.offsetTop) / rect.height) * 100 + "%";

  list.classList.add("appear");
}

const canvas = document.getElementById("mainCanvas");
const workspace = new Workspace("circuit", canvas);
const palette = document.querySelector(".palette");

function registerComponent(component) {
  const newItem = document.createElement("img");
  newItem.draggable = false;
  newItem.classList.add("palette-item");
  newItem.alt = newItem.title = component.label;

  newItem.src = component.getSelfPortrait();

  let instance;

  newItem.addEventListener("pointerdown", (e) => {
    palette.draggedInstance = instance = component.clone();
    const pos = workspace.screenToWorld(e.clientX - (instance.width / 2) * workspace.zoom, e.clientY - (instance.height / 2) * workspace.zoom);
    const command = new AddComponentCommand(workspace, instance, ...pos);
    instance.new = true;
    instance.createCommand = command;
    workspace.addComponent(instance, ...pos);
    workspace.draggedComponent = instance;
    palette.classList.remove("open");
  });

  newItem.addEventListener("pointerleave", () => {
    if (instance !== undefined) {
      palette.draggedInstance = instance = undefined;
    }
  });

  newItem.addEventListener("pointerup", () => {
    if (instance === undefined) return;
    const position = workspace.screenToWorld(workspace.ctx.canvas.width / 2, workspace.ctx.canvas.height / 2);
    instance.setPosition(
      Math.round(position[0] - instance.width / 2 / workspace.gridSize) * workspace.gridSize,
      Math.round(position[1] - instance.height / 2 / workspace.gridSize) * workspace.gridSize,
      true
    );
  });

  newItem.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  palette.appendChild(newItem);
}

function registerCustomComponent(component) {
  registerComponent(component);
  const storedArray = JSON.parse(localStorage.getItem("custom_components")) || [];
  storedArray.push(component.toPersistenceObject());
  localStorage.setItem("custom_components", JSON.stringify(storedArray));
}

function initializePalette() {
  if (workspace.components.length === 0) palette.classList.add("open");

  palette.addEventListener("pointerup", function () {
    if (workspace.draggedComponent && palette.draggedInstance === undefined) {
      workspace.history.execute(new RemoveComponentCommand(workspace, workspace.draggedComponent));
      workspace.draggedComponent = undefined;
    }
    palette.draggedInstance = undefined;
    this.classList.remove("danger");
  });

  document.addEventListener("pointerup", () => palette.classList.remove("closed"));

  palette.addEventListener("pointerenter", function () {
    if (workspace.draggedComponent) {
      this.classList.add("danger");
    }
  });

  palette.addEventListener("pointerleave", function () {
    if (workspace.draggedComponent) {
      this.classList.remove("danger");
    }
  });

  for (const key in defaultComponents) registerComponent(defaultComponents[key]);
  const shelf = document.createElement("div");
  shelf.className = "shelf";
  palette.prepend(shelf);
  shelf.appendChild(palette.children[1]);
  shelf.appendChild(palette.children[1]);

  JSON.parse(localStorage.getItem("custom_components"))?.forEach((c) => registerComponent(CustomComponent.fromPersistenceObject(c)));
}

window.addEventListener("load", initializePalette);

workspace.draw();
