/*jshint esversion: 6, browser:true, node:true, jquery:true, unused: true, eqeqeq: true, elision:true*/
function getURLParameter(name) {
    return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search) || [, ""])[1].replace(/\+/g, '%20')) || null;
}

let fs = null;
let loadOnStart = getURLParameter('load');

addEventListener('app-ready', () => {
	fs = require('fs');
	$('#import').hide();
	$('#export').hide();
	$('#export-game').hide();
});

let graph = new joint.dia.Graph();

let defaultLink = new joint.dia.Link(
{
	attrs:
	{
		'.marker-target': { d: 'M 10 0 L 0 5 L 10 10 z', },
		'.link-tools .tool-remove circle, .marker-vertex': { r: 8 },
	},
});


defaultLink.set('smooth', true);

let allowableConnections =
[
	['dialogue.Text', 'dialogue.Text'],
	['dialogue.Text', 'dialogue.Node'],
	['dialogue.Text', 'dialogue.Choice'],
	['dialogue.Text', 'dialogue.Set'],
	['dialogue.Text', 'dialogue.Branch'],
	['dialogue.Text', 'dialogue.Blocker'],
	['dialogue.Text', 'dialogue.Event'],
	['dialogue.Node', 'dialogue.Text'],
	['dialogue.Node', 'dialogue.Node'],
	['dialogue.Node', 'dialogue.Choice'],
	['dialogue.Node', 'dialogue.Set'],
	['dialogue.Node', 'dialogue.Branch'],
	['dialogue.Node', 'dialogue.Blocker'],
	['dialogue.Node', 'dialogue.Event'],
	['dialogue.Choice', 'dialogue.Text'],
	['dialogue.Choice', 'dialogue.Node'],
	['dialogue.Choice', 'dialogue.Set'],
	['dialogue.Choice', 'dialogue.Branch'],
	['dialogue.Choice', 'dialogue.Blocker'],
	['dialogue.Choice', 'dialogue.Event'],
	['dialogue.Set', 'dialogue.Text'],
	['dialogue.Set', 'dialogue.Node'],
	['dialogue.Set', 'dialogue.Set'],
	['dialogue.Set', 'dialogue.Branch'],
	['dialogue.Set', 'dialogue.Blocker'],
	['dialogue.Set', 'dialogue.Event'],
	['dialogue.Branch', 'dialogue.Text'],
	['dialogue.Branch', 'dialogue.Node'],
	['dialogue.Branch', 'dialogue.Set'],
	['dialogue.Branch', 'dialogue.Branch'],
	['dialogue.Branch', 'dialogue.Blocker'],
	['dialogue.Branch', 'dialogue.Event'],
	['dialogue.Blocker', 'dialogue.Text'],
	['dialogue.Blocker', 'dialogue.Node'],
	['dialogue.Blocker', 'dialogue.Choice'],
	['dialogue.Blocker', 'dialogue.Set'],
	['dialogue.Blocker', 'dialogue.Branch'],
	['dialogue.Blocker', 'dialogue.Event'],
	['dialogue.Blocker', 'dialogue.Blocker'],
	['dialogue.Event', 'dialogue.Text'],
	['dialogue.Event', 'dialogue.Node'],
	['dialogue.Event', 'dialogue.Choice'],
	['dialogue.Event', 'dialogue.Set'],
	['dialogue.Event', 'dialogue.Branch'],
	['dialogue.Event', 'dialogue.Blocker'],
];

function validateConnection(cellViewS, magnetS, cellViewT, magnetT)
{
	// Prevent loop linking
	if (magnetS === magnetT)
		return false;

	if (cellViewS === cellViewT)
		return false;
	
	// Can't connect to an output port
	if (magnetT.attributes.magnet.nodeValue !== 'passive') 
		return false;

	let sourceType = cellViewS.model.attributes.type;
	let targetType = cellViewT.model.attributes.type;
	let valid = false;
	for (let i = 0; i < allowableConnections.length; i++)
	{
		let rule = allowableConnections[i];
		if (sourceType === rule[0] && targetType === rule[1])
		{
			valid = true;
			break;
		}
	}
	if (!valid)
		return false;

	return true;
}

function validateMagnet(cellView, magnet)
{
	if (magnet.getAttribute('magnet') === 'passive')
		return false;

	// If unlimited connections attribute is null, we can only ever connect to one object
	// If it is not null, it is an array of type strings which are allowed to have unlimited connections
	let unlimitedConnections = magnet.getAttribute('unlimitedConnections');
	let links = graph.getConnectedLinks(cellView.model);
	for (let i = 0; i < links.length; i++)
	{
		let link = links[i];
		if (link.attributes.source.id === cellView.model.id && link.attributes.source.port === magnet.attributes.port.nodeValue)
		{
			// This port already has a connection
			if (unlimitedConnections && link.attributes.target.id)
			{
				let targetCell = graph.getCell(link.attributes.target.id);
				if (unlimitedConnections.indexOf(targetCell.attributes.type) !== -1)
					// It's okay because this target type has unlimited connections
					return true; 
			} 
			return false;
		}
	}

	return true;
}

joint.shapes.dialogue = {};

joint.shapes.dialogue.Base = joint.shapes.devs.Model.extend(
{
	defaults: joint.util.deepSupplement
	(
		{
			type: 'dialogue.Base',
			size: { width: 250, height: 135 },
			name: '',
			attrs:
			{
				rect: { stroke: 'none', 'fill-opacity': 0 },
				text: { display: 'none' },
				'.inPorts circle': { magnet: 'passive' },
				'.outPorts circle': { magnet: true, },
			},
		},
		joint.shapes.devs.Model.prototype.defaults
	),
});
joint.shapes.dialogue.BaseView = joint.shapes.devs.ModelView.extend(
{
	template:
	[
		'<div class="node">',
		'<span class="label"></span>',
		'<button class="delete">x</button>',
		'<input type="text" class="title" placeholder="Title" />',
        '<input type="actor" class="actor" placeholder="Actor" />',
        '<p> <textarea type="text" class="text" rows="4" cols="25" placeholder="Speech"></textarea></p>',
        '</div>',
	].join(''),

	initialize: function()
	{
	  

		_.bindAll(this, 'updateBox');
		joint.shapes.devs.ModelView.prototype.initialize.apply(this, arguments);

		this.$box = $(_.template(this.template)());
		// Prevent paper from handling pointerdown.
		this.$box.find('input').on('mousedown click', function (evt) { evt.stopPropagation(); });

	    // Prevent paper from handling pointerdown.
		this.$box.find('textarea').on('mousedown click', function (evt) { evt.stopPropagation(); });


		// This is an example of reacting on the input change and storing the input data in the cell model.
		this.$box.find('input.title').on('change', _.bind(function(evt)
		{
			this.model.set('title', $(evt.target).val());
		}, this));

	    // This is an example of reacting on the input change and storing the input data in the cell model.
		this.$box.find('input.actor').on('change', _.bind(function (evt) {
		    this.model.set('actor', $(evt.target).val());
		}, this));


	    // This is an example of reacting on the input change and storing the input data in the cell model. TEXTAREA
		this.$box.find('textarea.text').on('change', _.bind(function (evt) {
		    this.model.set('text', $(evt.target).val());
		}, this));

		this.$box.find('.delete').on('click', _.bind(this.model.remove, this.model));
		// Update the box position whenever the underlying model changes.
		this.model.on('change', this.updateBox, this);
		// Remove the box when the model gets removed from the graph.
		this.model.on('remove', this.removeBox, this);

		this.updateBox();
	},

	render: function()
	{
		joint.shapes.devs.ModelView.prototype.render.apply(this, arguments);
		this.paper.$el.prepend(this.$box);
		this.updateBox();
		return this;
	},
	
	updateBox: function()
	{
		// Set the position and dimension of the box so that it covers the JointJS element.
	    let bbox = this.model.getBBox();
       
		// Example of updating the HTML with a data stored in the cell model.
		let titleField = this.$box.find('input.title');
		if (!titleField.is(':focus'))
		    titleField.val(this.model.get('title'));

	    // Example of updating the HTML with a data stored in the cell model.
		let actorField = this.$box.find('input.actor');
		if (!actorField.is(':focus'))
		    actorField.val(this.model.get('actor'));

	    // Example of updating the HTML with a data stored in the cell model.
		let textAreaField = this.$box.find('textarea.text');
		if (!textAreaField.is(':focus'))
		    textAreaField.val(this.model.get('text'));

		let label = this.$box.find('.label');
		let type = this.model.get('type').slice('dialogue.'.length);
		label.text(type);
		label.attr('class', 'label ' + type);
		this.$box.css({ width: bbox.width, height: bbox.height, left: bbox.x, top: bbox.y, transform: 'rotate(' + (this.model.get('angle') || 0) + 'deg)' });
	},

	removeBox: function()
	{
		this.$box.remove();
	},
});

joint.shapes.dialogue.BlockerView = joint.shapes.devs.ModelView.extend(
{
	template:
	[
		'<div class="node">',
		'<span class="label"></span>',
		'<button class="delete">x</button>',
		'<input type="text" class="blockertype" placeholder="Type" />',
		'<input type="text" class="name" placeholder="Name" />',
		'<p> <textarea type="text" class="state" rows="1" cols="25" placeholder="State"></textarea></p>',
		'</div>',
	].join(''),

	initialize: function()
	{
		

		_.bindAll(this, 'updateBox');
		joint.shapes.devs.ModelView.prototype.initialize.apply(this, arguments);

		this.$box = $(_.template(this.template)());
		// Prevent paper from handling pointerdown.
		this.$box.find('input').on('mousedown click', function (evt) { evt.stopPropagation(); });

		// Prevent paper from handling pointerdown.
		this.$box.find('textarea').on('mousedown click', function (evt) { evt.stopPropagation(); });


		// This is an example of reacting on the input change and storing the input data in the cell model.
		this.$box.find('input.blockertype').on('change', _.bind(function(evt)
		{
			this.model.set('blockertype', $(evt.target).val());
		}, this));

		// This is an example of reacting on the input change and storing the input data in the cell model.
		this.$box.find('input.name').on('change', _.bind(function(evt)
		{
			this.model.set('name', $(evt.target).val());
		}, this));


		// This is an example of reacting on the input change and storing the input data in the cell model. TEXTAREA
		this.$box.find('textarea.state').on('change', _.bind(function (evt) {
			this.model.set('state', $(evt.target).val());
		}, this));

		this.$box.find('.delete').on('click', _.bind(this.model.remove, this.model));
		// Update the box position whenever the underlying model changes.
		this.model.on('change', this.updateBox, this);
		// Remove the box when the model gets removed from the graph.
		this.model.on('remove', this.removeBox, this);

		this.updateBox();
	},

	render: function()
	{
		joint.shapes.devs.ModelView.prototype.render.apply(this, arguments);
		this.paper.$el.prepend(this.$box);
		this.updateBox();
		return this;
	},
	
	updateBox: function()
	{
		// Set the position and dimension of the box so that it covers the JointJS element.
		let bbox = this.model.getBBox();
		
		// Example of updating the HTML with a data stored in the cell model.
		let typeField = this.$box.find('input.blockertype');
		if (!typeField.is(':focus'))
			typeField.val(this.model.get('blockertype'));

		// Example of updating the HTML with a data stored in the cell model.
		let nameField = this.$box.find('input.name');
		if (!nameField.is(':focus'))
			nameField.val(this.model.get('name'));

		// Example of updating the HTML with a data stored in the cell model.
		let stateField = this.$box.find('textarea.state');
		if (!stateField.is(':focus'))
			stateField.val(this.model.get('state'));

		let label = this.$box.find('.label');
		let type = this.model.get('type').slice('dialogue.'.length);
		label.text(type);
		label.attr('class', 'label ' + type);
		this.$box.css({ width: bbox.width, height: bbox.height, left: bbox.x, top: bbox.y, transform: 'rotate(' + (this.model.get('angle') || 0) + 'deg)' });
	},

	removeBox: function()
	{
		this.$box.remove();
	},
});

joint.shapes.dialogue.EventView = joint.shapes.devs.ModelView.extend(
{
	template:
	[
		'<div class="node">',
		'<span class="label"></span>',
		'<button class="delete">x</button>',
		'<input type="text" class="event" placeholder="Event" />',
		'<p> <textarea type="text" class="dataset" rows="1" cols="25" placeholder="Dataset"></textarea></p>',
		'</div>',
	].join(''),

	initialize: function()
	{
		

		_.bindAll(this, 'updateBox');
		joint.shapes.devs.ModelView.prototype.initialize.apply(this, arguments);

		this.$box = $(_.template(this.template)());
		// Prevent paper from handling pointerdown.
		this.$box.find('input').on('mousedown click', function (evt) { evt.stopPropagation(); });

		// Prevent paper from handling pointerdown.
		this.$box.find('textarea').on('mousedown click', function (evt) { evt.stopPropagation(); });


		// This is an example of reacting on the input change and storing the input data in the cell model.
		this.$box.find('input.event').on('change', _.bind(function(evt)
		{
			this.model.set('event', $(evt.target).val());
		}, this));

		// This is an example of reacting on the input change and storing the input data in the cell model. TEXTAREA
		this.$box.find('textarea.dataset').on('change', _.bind(function (evt) {
			this.model.set('dataset', $(evt.target).val());
		}, this));

		this.$box.find('.delete').on('click', _.bind(this.model.remove, this.model));
		// Update the box position whenever the underlying model changes.
		this.model.on('change', this.updateBox, this);
		// Remove the box when the model gets removed from the graph.
		this.model.on('remove', this.removeBox, this);

		this.updateBox();
	},

	render: function()
	{
		joint.shapes.devs.ModelView.prototype.render.apply(this, arguments);
		this.paper.$el.prepend(this.$box);
		this.updateBox();
		return this;
	},
	
	updateBox: function()
	{
		// Set the position and dimension of the box so that it covers the JointJS element.
		let bbox = this.model.getBBox();
		
		// Example of updating the HTML with a data stored in the cell model.
		let nameField = this.$box.find('input.event');
		if (!nameField.is(':focus'))
			nameField.val(this.model.get('event'));

		// Example of updating the HTML with a data stored in the cell model.
		let actorField = this.$box.find('input.dataset');
		if (!actorField.is(':focus'))
			actorField.val(this.model.get('dataset'));

		// Example of updating the HTML with a data stored in the cell model.
		let textAreaField = this.$box.find('textarea.dataset');
		if (!textAreaField.is(':focus'))
			textAreaField.val(this.model.get('dataset'));

		let label = this.$box.find('.label');
		let type = this.model.get('type').slice('dialogue.'.length);
		label.text(type);
		label.attr('class', 'label ' + type);
		this.$box.css({ width: bbox.width, height: bbox.height, left: bbox.x, top: bbox.y, transform: 'rotate(' + (this.model.get('angle') || 0) + 'deg)' });
	},

	removeBox: function()
	{
		this.$box.remove();
	},
});


joint.shapes.dialogue.ChoiceView = joint.shapes.devs.ModelView.extend(
{
    template:
	[
		'<div class="node">',
		'<span class="label"> </span>',
		'<button class="delete">x</button>',
		'<input type="choice" class="title" placeholder="Title" />',
		'<input type="text" class="priority" placeholder="Priority" />',
        '<p> <textarea type="text" class="text" rows="4" cols="25" placeholder="Speech"></textarea></p>',
		'</div>',
        		
	].join(''),

    initialize: function () {


        _.bindAll(this, 'updateBox');
        joint.shapes.devs.ModelView.prototype.initialize.apply(this, arguments);

        this.$box = $(_.template(this.template)());
        // Prevent paper from handling pointerdown.
        this.$box.find('textarea').on('mousedown click', function (evt) { evt.stopPropagation(); });
        this.$box.find('input').on('mousedown click', function (evt) { evt.stopPropagation(); });
        this.$box.find('idd').on('mousedown click', function (evt) { evt.stopPropagation(); });

        // This is an example of reacting on the input change and storing the input data in the cell model.
        this.$box.find('input.title').on('change', _.bind(function (evt) {
            this.model.set('title', $(evt.target).val());
		}, this));

		// This is an example of reacting on the input change and storing the input data in the cell model.
		this.$box.find('input.priority').on('change', _.bind(function (evt) {
			this.model.set('priority', $(evt.target).val());
		}, this));
		
		// This is an example of reacting on the input change and storing the input data in the cell model.
		this.$box.find('textarea.text').on('change', _.bind(function (evt) {
			this.model.set('text', $(evt.target).val());
		}, this));

        this.$box.find('.delete').on('click', _.bind(this.model.remove, this.model));
        // Update the box position whenever the underlying model changes.
        this.model.on('change', this.updateBox, this);
        // Remove the box when the model gets removed from the graph.
        this.model.on('remove', this.removeBox, this);

        this.updateBox();
    },

    render: function () {
        joint.shapes.devs.ModelView.prototype.render.apply(this, arguments);
        this.paper.$el.prepend(this.$box);
        this.updateBox();
        return this;
    },

    updateBox: function () {
        // Set the position and dimension of the box so that it covers the JointJS element.
        let bbox = this.model.getBBox();

        // Example of updating the HTML with a data stored in the cell model.
        let titleField = this.$box.find('input.title');
        if (!titleField.is(':focus'))
			titleField.val(this.model.get('title'));

		// Example of updating the HTML with a data stored in the cell model.
		let priorityField = this.$box.find('input.priority');
		if (!priorityField.is(':focus'))
			priorityField.val(this.model.get('priority'));

		// Example of updating the HTML with a data stored in the cell model.
		let textField = this.$box.find('textarea.text');
		if (!textField.is(':focus'))
			textField.val(this.model.get('text'));

        let label = this.$box.find('.label');
        let type = this.model.get('type').slice('dialogue.'.length);
        label.text(type);
        label.attr('class', 'label ' + type);


        this.$box.css({ width: bbox.width, height: bbox.height, left: bbox.x, top: bbox.y, transform: 'rotate(' + (this.model.get('angle') || 0) + 'deg)' });
    },

    removeBox: function () {
        this.$box.remove();
    },
});


joint.shapes.dialogue.Node = joint.shapes.devs.Model.extend(
{
	defaults: joint.util.deepSupplement
	(
		{
			type: 'dialogue.Node',
			inPorts: ['input'],
			outPorts: ['output'],
			attrs:
			{
				'.outPorts circle': { unlimitedConnections: ['dialogue.Choice'], }
			},
		},
		joint.shapes.dialogue.Base.prototype.defaults
	),
});
joint.shapes.dialogue.NodeView = joint.shapes.dialogue.BaseView;

joint.shapes.dialogue.Blocker = joint.shapes.devs.Model.extend(
{
	defaults: joint.util.deepSupplement
	(
		{
			type: 'dialogue.Blocker',
			inPorts: ['input'],
			outPorts: ['output'],
			state:'',
			blockertype:'',
			name:'',
			attrs:
			{
				'.outPorts circle': { unlimitedConnections: ['dialogue.Choice', 'dialogue.Blocker'], }
			},
		},
		joint.shapes.dialogue.Base.prototype.defaults
	),
});

joint.shapes.dialogue.Event = joint.shapes.devs.Model.extend(
{
	defaults: joint.util.deepSupplement
	(
		{
			type: 'dialogue.Event',
			inPorts: ['input'],
			outPorts: ['output'],
			event:'',
			dataset:'',
			attrs:
			{
				'.outPorts circle': { unlimitedConnections: ['dialogue.Choice'], }
			},
		},
		joint.shapes.dialogue.Base.prototype.defaults
	),
});
// joint.shapes.dialogue.BlockerView = joint.shapes.dialogue.BlockerView;

joint.shapes.dialogue.Text = joint.shapes.devs.Model.extend(
{
	defaults: joint.util.deepSupplement
	(
		{
			type: 'dialogue.Text',
			inPorts: ['input'],
			outPorts: ['output'],
			title: '',
			actor: '',
			text: '',
			attrs:
			{
				'.outPorts circle': { unlimitedConnections: ['dialogue.Choice'], }
			},
		},
		joint.shapes.dialogue.Base.prototype.defaults
	),
});
joint.shapes.dialogue.TextView = joint.shapes.dialogue.BaseView;


joint.shapes.dialogue.Choice = joint.shapes.devs.Model.extend(
{
	defaults: joint.util.deepSupplement
	(
		{
		    size: { width: 250, height: 135 },
			type: 'dialogue.Choice',
			inPorts: ['input'],
			outPorts: ['output'],
			title: '',
			priority: '',
            text: '',
		},
		joint.shapes.dialogue.Base.prototype.defaults
	),
});
joint.shapes.dialogue.ChoiceView = joint.shapes.dialogue.ChoiceView;


joint.shapes.dialogue.Branch = joint.shapes.devs.Model.extend(
{
	defaults: joint.util.deepSupplement
	(
		{
			type: 'dialogue.Branch',
			size: { width: 200, height: 100, },
			inPorts: ['input'],
			outPorts: ['output0'],
			values: [],
		},
		joint.shapes.dialogue.Base.prototype.defaults
	),
});
joint.shapes.dialogue.BranchView = joint.shapes.dialogue.BaseView.extend(
{
	template:
	[
		'<div class="node">',
		'<span class="label"></span>',
		'<button class="delete">x</button>',
		'<button class="add">+</button>',
		'<button class="remove">-</button>',
		'<input type="text" class="name" placeholder="Variable" />',
		'<input type="text" value="Default" readonly/>',
		'</div>',
	].join(''),

	initialize: function()
	{
		joint.shapes.dialogue.BaseView.prototype.initialize.apply(this, arguments);
		this.$box.find('.add').on('click', _.bind(this.addPort, this));
		this.$box.find('.remove').on('click', _.bind(this.removePort, this));
	},

	removePort: function()
	{
		if (this.model.get('outPorts').length > 1)
		{
			let outPorts = this.model.get('outPorts').slice(0);
			outPorts.pop();
			this.model.set('outPorts', outPorts);
			let values = this.model.get('values').slice(0);
			values.pop();
			this.model.set('values', values);
			this.updateSize();
		}
	},

	addPort: function()
	{
		let outPorts = this.model.get('outPorts').slice(0);
		outPorts.push('output' + outPorts.length.toString());
		this.model.set('outPorts', outPorts);
		let values = this.model.get('values').slice(0);
		values.push(null);
		this.model.set('values', values);
		this.updateSize();
	},

	updateBox: function()
	{
		joint.shapes.dialogue.BaseView.prototype.updateBox.apply(this, arguments);
		let values = this.model.get('values');
		let valueFields = this.$box.find('input.value');

		// Add value fields if necessary
		for (let i = valueFields.length; i < values.length; i++)
		{
			// Prevent paper from handling pointerdown.
			let field = $('<input type="text" class="value" />');
			field.attr('placeholder', 'Value ' + (i + 1).toString());
			field.attr('index', i);
			this.$box.append(field);
			field.on('mousedown click', function(evt) { evt.stopPropagation(); });

			// This is an example of reacting on the input change and storing the input data in the cell model.
			field.on('change', _.bind(function(evt)
			{
				let values = this.model.get('values').slice(0);
				values[$(evt.target).attr('index')] = $(evt.target).val();
				this.model.set('values', values);
			}, this));
		}

		// Remove value fields if necessary
		for (let i = values.length; i < valueFields.length; i++)
			$(valueFields[i]).remove();

		// Update value fields
		valueFields = this.$box.find('input.value');
		for (let i = 0; i < valueFields.length; i++)
		{
			let field = $(valueFields[i]);
			if (!field.is(':focus'))
				field.val(values[i]);
		}
	},

	updateSize: function()
	{
		let textField = this.$box.find('input.name');
		let height = textField.outerHeight(true);
		this.model.set('size', { width: 200, height: 100 + Math.max(0, (this.model.get('outPorts').length - 1) * height) });
	},
});


joint.shapes.dialogue.Set = joint.shapes.devs.Model.extend(
{
	defaults: joint.util.deepSupplement
	(
		{
		    type: 'dialogue.Set',
		    inPorts: ['input'],
		    outPorts: ['output'],
		    size: { width: 200, height: 100, },
		    value: '',
		},
		joint.shapes.dialogue.Base.prototype.defaults
	),
});
joint.shapes.dialogue.SetView = joint.shapes.dialogue.BaseView.extend(
{
	template:
	[
		'<div class="node">',
		'<span class="label"></span>',
		'<button class="delete">x</button>',
		'<input type="text" class="name" placeholder="Variable" />',
		'<input type="text" class="value" placeholder="Value" />',
		'</div>',
	].join(''),

	initialize: function()
	{
		joint.shapes.dialogue.BaseView.prototype.initialize.apply(this, arguments);
		this.$box.find('input.value').on('change', _.bind(function(evt)
		{
			this.model.set('value', $(evt.target).val());
		}, this));
	},

	updateBox: function()
	{
		joint.shapes.dialogue.BaseView.prototype.updateBox.apply(this, arguments);
		let field = this.$box.find('input.value');
		if (!field.is(':focus'))
			field.val(this.model.get('value'));
	},
});

function gameData()
{
	let cells = graph.toJSON().cells;
	let nodesByID = {};
	let cellsByID = {};
	let nodes = [];
	for (let i = 0; i < cells.length; i++)
	{
		let cell = cells[i];
		if (cell.type !== 'link')
		{
			let node =
			{
				type: cell.type.slice('dialogue.'.length),
				id: cell.id,
				actor: cell.actor,
                title: cell.title,
			};
			if (node.type === 'Branch')
			{
				node.variable = cell.name;
				node.branches = {};
				for (let j = 0; j < cell.values.length; j++)
				{
					let branch = cell.values[j];
					node.branches[branch] = null;
				}
			}
			else if (node.type === 'Set')
			{
				node.variable = cell.name;
				node.value = cell.value;
				node.next = null;
			}

			else if (node.type === 'Blocker')
			{
				node.state = cell.state;
				node.blockertype = cell.blockertype;
				node.name = cell.name;
				node.next = null;                
			}

			else if (node.type === 'Event')
			{
				node.event = cell.event;
				node.dataset = cell.dataset;
				node.next = null;
			}

			else if (node.type === 'Choice') {
				node.text = cell.text;
				node.priority = cell.priority;
			    node.title = cell.title;
			    node.next = null;
			}
			else
			{
			    node.actor = cell.actor;
				node.text = cell.text;
				node.next = null;
			}

			nodes.push(node);
			nodesByID[cell.id] = node;
			cellsByID[cell.id] = cell;
		}
	}
	for (let i = 0; i < cells.length; i++)
	{
		let cell = cells[i];
		if (cell.type === 'link')
		{
			let source = nodesByID[cell.source.id];
			let target = cell.target ? nodesByID[cell.target.id] : null;
			if (source)
			{
				if (source.type === 'Branch')
				{
					let portNumber = parseInt(cell.source.port.slice('output'.length));
					let value;
					if (portNumber === 0)
						value = '_default';
					else
					{
						let sourceCell = cellsByID[source.id];
						value = sourceCell.values[portNumber - 1];
					}
					source.branches[value] = target ? target.id : null;
				}
				else if ((source.type === 'Text' || source.type === 'Node') && target && target.type === 'Choice')
				{
					if (!source.choices){
						source.choices = [];
						delete source.next;
					}
					source.choices.push(target.id);
				}
				else {

					if (source.next) {
						source.next.push(target ? target.id : null);
					} else {
						source.next = [target ? target.id : null];
					}
				}					
			}


			if (target.type === 'Blocker'){

				if (!source.blockers){
					source.blockers = [];
				}

				source.blockers.push(target.id);
			}


		}
	}
	return nodes;
}


let filename = null;
let defaultFilename = 'dialogue.json';

function flash(text)
{
	let $flash = $('#flash');
	$flash.text(text);
	$flash.stop(true, true);
	$flash.show();
	$flash.css('opacity', 1.0);
	$flash.fadeOut({ duration: 1500 });
}

function offerDownload(name, data)
{
	let a = $('<a>');
	a.attr('download', name);
	a.attr('href', 'data:application/json,' + encodeURIComponent(JSON.stringify(data)));
	a.attr('target', '_blank');
	a.hide();
	$('body').append(a);
	a[0].click();
	a.remove();
}

function promptFilename(callback)
{
	if (fs)
	{
		filename = null;
		window.frame.openDialog(
		{
			type: 'save',
		}, function(err, files)
		{
			if (!err && files.length === 1)
			{
				filename = files[0];
				callback(filename);
			}
		});
	}
	else
	{
		filename = prompt('Filename', defaultFilename);
		callback(filename);
	}
}

function applyTextFields()
{
	$('input[type=text]').blur();
}

function save()
{
	applyTextFields();
	if (!filename)
		promptFilename(doSave);
	else
		doSave();
}

function doSave()
{
	if (filename)
	{
		if (fs)
		{
			fs.writeFileSync(filename, JSON.stringify(graph), 'utf8');
			fs.writeFileSync(gameFilenameFromNormalFilename(filename), JSON.stringify(gameData()), 'utf8');
		}
		else
		{
			if (!localStorage[filename])
				addFileEntry(filename);
			localStorage[filename] = JSON.stringify(graph);
		}
		flash('Saved ' + filename);
	}
}

function load()
{
    if (fs) {
        window.frame.openDialog(
		{
		    type: 'open',
		    multiSelect: false,
		}, function (err, files) {
		    if (!err && files.length === 1) {
		        graph.clear();
		        filename = files[0];
		        graph.fromJSON(JSON.parse(fs.readFileSync(filename, 'utf8')));
		    }
		});
    }

    else {

        $('#menu').show();
    }
}

function exportFile()
{
	if (!fs)
	{
		applyTextFields();
		offerDownload(filename ? filename : defaultFilename, graph);
	}
}

function gameFilenameFromNormalFilename(f)
{
    return f.substring(0, f.length - 2) + 'on';
}

function exportGameFile()
{
	if (!fs)
	{
		applyTextFields();
		offerDownload(gameFilenameFromNormalFilename(filename ? filename : defaultFilename), gameData());
	}
}

function importFile()
{
	if (!fs)
		$('#file').click();
}

function add(constructor)
{
	return function()
	{
		let position = $('#cmroot').position();
		let container = $('#container')[0];
		let element = new constructor(
		{
			position: { x: position.left + container.scrollLeft, y: position.top + container.scrollTop },
		});
		graph.addCells([element]);
	};
}

function clear()
{
	graph.clear();
	filename = null;
}

let paper = new joint.dia.Paper(
{
	el: $('#paper'),
	width: 16000,
	height: 8000,
	model: graph,
	gridSize: 16,
	defaultLink: defaultLink,
	validateConnection: validateConnection,
	validateMagnet: validateMagnet,
	snapLinks: { radius: 75 }

});

let panning = false;
let mousePosition = { x: 0, y: 0 };
paper.on('blank:pointerdown', function(e)
{
	panning = true;
	mousePosition.x = e.pageX;
	mousePosition.y = e.pageY;
	$('body').css('cursor', 'move');
	applyTextFields();
});
paper.on('cell:pointerdown', function()
{
	applyTextFields();
});

$('#container').mousemove(function(e)
{
	if (panning)
	{
		let $this = $(this);
		$this.scrollLeft($this.scrollLeft() + mousePosition.x - e.pageX);
		$this.scrollTop($this.scrollTop() + mousePosition.y - e.pageY);
		mousePosition.x = e.pageX;
		mousePosition.y = e.pageY;
	}
});

$('#container').mouseup(function ()
{
	panning = false;
	$('body').css('cursor', 'default');
});

function handleFiles(files)
{
	filename = files[0].name;
	let fileReader = new FileReader();
	fileReader.onload = function(e)
	{
		graph.clear();
		graph.fromJSON(JSON.parse(e.target.result));
	};
	fileReader.readAsText(files[0]);
}

$('#file').on('change', function()
{
	handleFiles(this.files);
});

$('body').on('dragenter', function(e)
{
	e.stopPropagation();
	e.preventDefault();
});

$('body').on('dragexit', function(e)
{
	e.stopPropagation();
	e.preventDefault();
});

$('body').on('dragover', function(e)
{
	e.stopPropagation();
	e.preventDefault();
});

$('body').on('drop', function(e)
{
	e.stopPropagation();
	e.preventDefault();
	handleFiles(e.originalEvent.dataTransfer.files);
});

$(window).on('keydown', function(event)
{
	// Catch Ctrl-S or key code 19 on Mac (Cmd-S)
	if (((event.ctrlKey || event.metaKey) && String.fromCharCode(event.which).toLowerCase() ==='s') || event.which === 19)
	{
		event.stopPropagation();
		event.preventDefault();
		save();
		return false;
	}
	else if ((event.ctrlKey || event.metaKey) && String.fromCharCode(event.which).toLowerCase() === 'o')
	{
		event.stopPropagation();
		event.preventDefault();
		load();
		return false;
	}
	else if ((event.ctrlKey || event.metaKey) && String.fromCharCode(event.which).toLowerCase() === 'e')
	{
		event.stopPropagation();
		event.preventDefault();
		exportFile();
		return false;
	}
	return true;
});



$(window).resize(function()
{
	applyTextFields();
	let $window = $(window);
	let $container = $('#container');
		$container.height($window.innerHeight());
		$container.width($window.innerWidth());
		let $menu = $('#menu');
		$menu.css('top', Math.max(0, (($window.height() - $menu.outerHeight()) / 2)) + 'px');
		$menu.css('left', Math.max(0, (($window.width() - $menu.outerWidth()) / 2)) + 'px');
		return this;
});

function addFileEntry(name)
{
	let entry = $('<div>');
	entry.text(name);
	let deleteButton = $('<button class="delete">-</button>');
	entry.append(deleteButton);
	$('#menu').append(entry);

	deleteButton.on('click', function(event)
	{
		localStorage.removeItem(name);
		entry.remove();
		event.stopPropagation();
	});

	entry.on('click', function()
	{
		graph.clear();
		graph.fromJSON(JSON.parse(localStorage[name]));
		filename = name;
		$('#menu').hide();
	});
}

(function()
{
	for (let i = 0; i < localStorage.length; i++)
		addFileEntry(localStorage.key(i));
})();

$('#menu button.close').click(function()
{
	$('#menu').hide();
	panning = false;
});

$(window).trigger('resize');

$('#paper').contextmenu(
{
	width: 150,
	items:
	[
		{ text: 'Text', alias: '1-1', action: add(joint.shapes.dialogue.Text) },
		{ text: 'Choice', alias: '1-2', action: add(joint.shapes.dialogue.Choice) },
		{ text: 'Branch', alias: '1-3', action: add(joint.shapes.dialogue.Branch) },
		{ text: 'Set', alias: '1-4', action: add(joint.shapes.dialogue.Set) },
		{ text: 'Node', alias: '1-5', action: add(joint.shapes.dialogue.Node) },
		{ text: 'Blocker', alias: '1-6', action: add(joint.shapes.dialogue.Blocker) },
		{ text: 'Event', alias: '1-7', action: add(joint.shapes.dialogue.Event) },
		{ type: 'splitLine' },
		{ text: 'Save', alias: '2-1', action: save },
		{ text: 'Load', alias: '2-2', action: load },
		{ text: 'Import', id: 'import', alias: '2-3', action: importFile },
		{ text: 'New', alias: '2-4', action: clear },
		{ text: 'Export', id: 'export', alias: '2-5', action: exportFile },
		{ text: 'Export game file', id: 'export-game', alias: '2-6', action: exportGameFile },
	]
});

///AUTOLOAD IF URL HAS ? WILDCARD
if (loadOnStart !== null) {
    loadOnStart += '.json';
    console.log(loadOnStart);
    graph.clear();
    filename = loadOnStart;
    graph.fromJSON(JSON.parse(localStorage[loadOnStart]));
}
