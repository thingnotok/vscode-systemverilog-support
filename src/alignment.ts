import * as vscode from 'vscode';



export function alignment(){
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
      return;
  }
  const selections = editor.selections;
  let selection = selections[0];
  let range = new vscode.Range(selection.start.line, 0, selection.end.character > 0 ? selection.end.line : selection.end.line - 1, 1024);
  let text = editor.document.getText(range);
  let recontruct = test_new(text);
  
  editor.edit((editBuilder) => {
    editBuilder.replace(range, recontruct);
  });
}

const declaration_regformat = [
  /\/\/.*/, //line comment
  /((reg|wire|logic|integer|bit|byte|shortint|int|longint|time|shortreal|real|double|realtime|assign)  *(signed)* *)/, //data_type
  /((<=.*)|(=.*);)|;/,  //assignment
  /(\[[^:]*:[^:]*\])+/, //vector
  /(\[[^:]*:[^:]*\])+/, //array
  /.*/, // variable (/wo assignment)
];
const dec_or_assign = /(((reg|wire|logic|integer|bit|byte|shortint|int|longint|time|shortreal|real|double|realtime|assign)  *(signed)* *))|((<=.*)|(=.*))/;

const moduleio_regformat = /module\s+\b([A-Za-z_][A-Za-z0-9_]*)\b/;

const io_regformat = [
  /\/\/.*/, //line comment
  /(input|output) *(reg|wire|logic|integer|bit|byte|shortint|int|longint|time|shortreal|real|double|realtime)*( *(signed)*)*/, //data_type
  /(\[[^:]*:[^:]*\])+/, //vector
  /.*/, // variable (/wo assignment)
];


function test_new(data){
  if(check_type(data, moduleio_regformat)){
    return new_io_proc(data);
  }
  else{
    return declration_and_assignment_proc(data);
  }
}

function declration_and_assignment_proc(data){
  let v1 = split_statements(data, '\n');
  let ident = get_ident(v1, dec_or_assign);
  let v2 = decs_handle(v1); // split a statement into fields and do inner-field prealignment
  let v3 = dec_format(v2, ident); // format the statements
  return v3;
}

function new_io_proc(data){
  let moduleIO = data.substring(data.indexOf('module'), data.indexOf(';')+1);
  let parametersName = [];
  let portsName = [];
  let data_inst = [];
  let each_line = [];
  let lines = moduleIO.split('\n');

  // find all parameters and ports
  let moduleName = moduleIO.match(/module\s+\b([A-Za-z_][A-Za-z0-9_]*)\b/)[0];
  if (moduleName !== null)
    each_line.push([moduleName, 'else']);
  lines.splice(0, 1);
  lines.forEach(line => {
      line = line.trim();
      let parm = line.match(/(parameter)\s+(\b[A-Za-z_][A-Za-z0-9_]*\b)\s*(.*)/);
      let variables = line.match(/((input|output|inout) (reg)?)?\s*(\[.*:.*\])*\s*(\b\w*[\b,]?)*\s*(\/\/[^\n]*)?/);
      if (parm !== null) {
        let comment = parm[3].match(/\/\/.*/);
        if(comment === null)
            comment = "";
        parm[3] = parm[3].replace(/\/\/.*/, "");
        parm.push(comment);
        parm[3] = parm[3].replace(/\s/g, '').replace(/([*/\-^|=])/, " $1 ");
        parm.push('isparam');
        each_line.push(parm);
      }
      else if(variables[5] !== undefined){
        variables[2] = variables[2].replace(/\s/g, '').replace(/([\*\/\-\^\|\=])/g, " $1 ");
        if(variables[4] != undefined)
          variables[4] = variables[4].replace(/\s/g, '').replace(/([\*\/\-\^\|\=])/g, " $1 ");
        variables.push('isvariables');
        each_line.push(variables);
      }
      else{
        each_line.push([line, 'else']);
      }
  });
  let line_infield = [];
  each_line.forEach(line => {
    if(line[line.length-1] == 'else')
      line_infield.push(['0', line[0]]);
    else if(line[line.length-1] == 'isparam'){
      let x = ['2'];
      for(let i =1; i<5; i++)
        x.push(udf2_empty(line[i]))
      line_infield.push(x);
    }
    else{
      let x = ['1'];
      for(let i =2; i<7; i++)
        x.push(udf2_empty(line[i]))
      line_infield.push(x);
    }
  });
  // handle , in alignment
  line_infield.forEach(function f(line){
    if(line[0] == '1')
      line[4] = line[4].replace(',', '');
    if(line[0] == '2')
      line[3] = line[3].replace(',', '');
  }, this);
  line_infield = align_vec(line_infield, 3, '1');
  let par_anchor = get_anchors_flag(line_infield, 4, '2');
  let var_anchor = get_anchors_flag(line_infield, 5, '1');
  line_infield = format_flag(line_infield, par_anchor, 2);
  line_infield = format_flag(line_infield, var_anchor, 1);
  let idx =0, p_idx =0, v_idx=0;
  line_infield.forEach(function f(line){
    if(line[0] == '1'){
      line[4] = line[4] + ',';
      p_idx = idx;
    }
    if(line[0] == '2'){
      line[3] = line[3] + ',';
      v_idx = idx;
    }
    idx ++;
  }, this);
  line_infield[p_idx][4] = line_infield[p_idx][4].replace(',', '');
  line_infield[v_idx][3] = line_infield[v_idx][3].replace(',', '');
  let resc = '';
  line_infield.forEach(function f(state){
    if(state[0] == '0')
      resc += '';
    else
      resc += '  ';
    for(let i=1;i<state.length;i++){
      resc += state[i] + '';
    }
    resc += '\n';
  }, this)
  return resc;
}


function align_vec(declarations, vec_field_idx, flag){
  let rval_max = [];
  declarations.forEach(function(dec){
    if(dec[0] == flag){
      if(dec[vec_field_idx].length > 0 && dec[vec_field_idx].search(/\[/) !== -1){ // has vector
        dec[0] = 'inprocess';
        let vec_ary = dec[vec_field_idx].split(/[\[\]:]/)
        vec_ary.pop();
        let idx = 0;
        dec[vec_field_idx] = cleanArray(vec_ary);
        dec[vec_field_idx].forEach(function(vec){
          if(idx<rval_max.length)
            rval_max[idx] = rval_max[idx] > vec.length ? rval_max[idx] : vec.length;
          else
            rval_max.push(vec.length);
          idx++;
        }, this);
      }
    }
  },this);
  declarations.forEach(function(dec){
    if(dec[0] == 'inprocess'){
      dec[0] = '1';
      let idx = 0;
      let restruc = '';
      dec[vec_field_idx].forEach(function(vec_w){
        if(idx%2 == 0)
          restruc += '[';
        restruc += ' '.repeat(rval_max[idx] - vec_w.length) + vec_w;
        if(idx%2 == 0)
          restruc += ':';
        else
          restruc += ']';
        idx++;
      }, this);
      dec[vec_field_idx] = restruc;
    }
  },this);
  
  return declarations;
}

function get_anchors_flag(statements_infield, num_of_anchors, flag){
  let anchors = [];
  for(let i=0;i<num_of_anchors;i++)
    anchors.push(0);
  statements_infield.forEach(function(statement){
    if(statement[0] == flag)
      for(let i = 0; i<num_of_anchors;i++)
        if(anchors[i]<statement[i+1].length)
          anchors[i] = statement[i+1].length;
  },this);
  for(let i = 0; i< anchors.length; i++){
    anchors[i] += anchors[i] > 0 ? 1 : 0;
  };
  return anchors;
}
function format_flag(statement_infield, anchors, flag){
  statement_infield.forEach(function f(state){
    if(state[0] == flag){
      for(let i=0; i<anchors.length; i++){
        state[i+1] = state[i+1] + ' '.repeat(anchors[i] - state[i+1].length);
      }
    }
  })
  return statement_infield;
}

function udf2_empty(in_str){
  return  in_str === undefined ? "" : in_str;
}

function io_proc(data){
  let statement_obj = {str : data};
  let mod = get_state_field(statement_obj, /module .*\(/);
  let modend = get_state_field(statement_obj, /\);/);
  let ss = statement_obj.str.replace(/,.*(\/\/.*)/g, '$1').replace(/,/g, ',\n');
  let ios = ss.split('\n');
  for(let i = 0;i< ios.length;i++){
    ios[i] = ios[i].replace(/,/g, '').trim();
  }
  ios = cleanArray(ios);
  let v2 = ios_handle(ios);
  let v3 = ios_format(v2, ' '.repeat(2));
  v3 = mod + '\n' + v3 + '\n' + modend;
  return v3;
}

const ios_handle = function (ios){
  let ios_r = [];
  ios.forEach(function f(io){
    ios_r.push(io_split(io));
  },this);
  ios_r = dec_align_vec(ios_r, 2); // align vector
  ios_r.forEach(function(io){
    if(io[0]=='1'){
      io[3] = io[3].replace(',', '');
      io[4] = ','+io[4];
    }
  },this);
  return ios_r;
}

const io_split = function(io_i) {
  if(check_type(io_i, io_regformat[1])) {// split into list of io field
    let io = io_into_fields(io_i, io_regformat);
    // io_reg [flag, comment, data_type, assignment, vector, array, variable] 
    let io_arrange = [io[0], io[2], io[3], io[4], io[1]];
    return io_arrange;
  }
  else if(!check_type(io_i, io_regformat[0]))
    return ['1', '', '', io_i.trim(), ''];
  else // unchange and marked as don't touch
    return ['0', io_i];
};

function io_into_fields(statement, fields){
  let format_list = ['1'];
  let statement_obj = {str : statement};
  format_list.push(get_state_field_donttouch(statement_obj, fields[0])); //comment
  format_list.push(get_state_field(statement_obj, fields[1])); // assignment
  format_list.push(get_state_field(statement_obj, fields[2])); // dtype
  format_list.push(get_state_field(statement_obj, fields[3])); // vector
  format_list.push(get_state_field(statement_obj, fields[4])); // array
  return format_list;
}

const ios_format = function(declarations_infield, ident){
  let anchors = get_anchors(declarations_infield, io_regformat.length);
  let recontructs = [];
  declarations_infield[declarations_infield.length-1][4] = declarations_infield[declarations_infield.length-1][4].replace(',', '');
  declarations_infield.forEach(function(dec){
    recontructs.push(format(dec, anchors, ident))
  },this);
  let r_text = '';
  recontructs.forEach(function(rec){
    r_text += rec + '\n';
  },this);
  return r_text.slice(0, -1);
}

const dec_format = function(declarations_infield, ident){
  let anchors = get_anchors(declarations_infield, declaration_regformat.length);
  let recontructs = [];
  declarations_infield.forEach(function(dec){
    recontructs.push(format(dec, anchors, ident))
  },this);
  let r_text = '';
  recontructs.forEach(function(rec){
    r_text += rec + '\n';
  },this);
  return r_text.slice(0, -1);
}

const decs_handle = function (declarations){
  let decs_r = [];
  declarations.forEach(function f(declaration){
    decs_r.push(dec_split(declaration));
  },this);
  
  // dec     [mask, dtype, vec, variable, array, assignment]
  decs_r = dec_align_vec(decs_r, 2); // align vector
  decs_r = dec_align_vec(decs_r, 4); // align array
  decs_r = dec_align_assignment(decs_r, 5); // align assignment

  return decs_r;
}

const dec_split = function(declaration) {
  if(check_type(declaration, dec_or_assign)) {// split into list of declaration field
    let dec = split_into_fields(declaration, declaration_regformat);
    // dec_reg [flag, comment, data_type, assignment, vector, array, variable] 
    let dec_arrange = [dec[0], dec[2], dec[4], dec[6], dec[5], dec[3], dec[1]];
    return dec_arrange;
  }
  else // unchange and marked as don't touch
    return ['0', declaration];
};

function dec_align_assignment(declarations, assign_idx){
  let rval_max = 0;
  declarations.forEach(function(dec){
    if(dec[0] == '1'){
      if(dec[assign_idx].search(/(=)/) !== -1){ // is assignment
        dec[assign_idx] = dec[assign_idx].replace(/([\+\-\*]{1,2}|\/)/g,  ' $1 ');
        dec[assign_idx] = dec[assign_idx].replace(/(,)/g,  '$1 ');
        if(dec[assign_idx].search(/<=/) !== -1){
          dec[assign_idx] = dec[assign_idx].slice(2, dec[assign_idx].length-1).trim();
          rval_max = dec[assign_idx].length > rval_max ? dec[assign_idx].length : rval_max;
          dec[assign_idx] = '<= '+ dec[assign_idx];
        }
        else {
          dec[assign_idx] = dec[assign_idx].slice(1, dec[assign_idx].length-1).trim();
          rval_max = dec[assign_idx].length > rval_max ? dec[assign_idx].length : rval_max;
          dec[assign_idx] = '= '+ dec[assign_idx];
        }
      }
      else {
        dec[assign_idx] = '';
      }
    }
  },this);
  rval_max += 2;
  declarations.forEach(function(dec){
    if(dec[0] == '1'){
      if(dec[assign_idx].search(/<=/) !== -1)
        dec[assign_idx] = dec[assign_idx] + ' '.repeat(rval_max+1 - dec[assign_idx].length) + ';';
      else
        dec[assign_idx] = dec[assign_idx] + ' '.repeat(rval_max - dec[assign_idx].length) + ';';
    }
  },this);
  return declarations;
}

function dec_align_vec(declarations, vec_field_idx){
  let rval_max = [];
  declarations.forEach(function(dec){
    if(dec[0] == '1'){
      if(dec[vec_field_idx].length > 0 && dec[vec_field_idx].search(/\[/) !== -1){ // has vector
        dec[0] = '2';
        let vec_ary = dec[vec_field_idx].split(/[\[\]:]/)
        vec_ary.pop();
        let idx = 0;
        dec[vec_field_idx] = cleanArray(vec_ary);
        dec[vec_field_idx].forEach(function(vec){
          if(idx<rval_max.length)
            rval_max[idx] = rval_max[idx] > vec.length ? rval_max[idx] : vec.length;
          else
            rval_max.push(vec.length);
          idx++;
        }, this);
      }
    }
  },this);
  declarations.forEach(function(dec){
    if(dec[0] == '2'){
      dec[0] = '1';
      let idx = 0;
      let restruc = '';
      dec[vec_field_idx].forEach(function(vec_w){
        if(idx%2 == 0)
          restruc += '[';
        restruc += ' '.repeat(rval_max[idx] - vec_w.length) + vec_w;
        if(idx%2 == 0)
          restruc += ':';
        else
          restruc += ']';
        idx++;
      }, this);
      dec[vec_field_idx] = restruc;
    }
  },this);
  
  return declarations;
}

function get_ident(declarations, type){
  let ident = '';
  for(let i=0; i<declarations.length;i++){
    if(check_type(declarations[i], type)) {// split into list of declaration field
      ident = declarations[i].match(/\s*/); // get ident from first statement
      break;
    }
  }
  return ident;
}

function format(statement_infield, anchors, ident){
  let recontruct = '';
  if(statement_infield[0]=='1'){
    recontruct += ident;
    for(let i=1; i<anchors.length;i++)
      recontruct += `${statement_infield[i]}${' '.repeat(anchors[i] - statement_infield[i].length)}`;
  }
  else
    recontruct+= statement_infield[1];
  return recontruct;
}
function split_statements(text, split_point){
  return text.split("\n");
}
function check_type(statement, type_identifier){
  if(statement.search(type_identifier) !== -1)
    return true;
  else
    return false;
}
function split_into_fields(statement, fields){
  let format_list = ['1'];
  let statement_obj = {str : statement};
  format_list.push(get_state_field_donttouch(statement_obj, fields[0])); //comment
  format_list.push(get_state_field(statement_obj, fields[1])); // assignment
  format_list.push(get_state_field(statement_obj, fields[2])); // dtype
  if(format_list[2]  == 'assign' || format_list[2] == ""){ //pure assignment
    format_list.push(""); //no vector
    format_list.push(""); //no array
  }
  else{
    format_list.push(get_state_field(statement_obj, fields[3])); // vector
    format_list.push(get_state_field(statement_obj, fields[4])); // array
  }
  format_list.push(get_state_field(statement_obj, fields[5]).replace(/(,)/g,  '$1 ')); // l_value or variable
  return format_list;
}

function get_anchors(statements_infield, num_of_anchors){
  let anchors = [];
  for(let i=0;i<num_of_anchors+1;i++)
    anchors.push(0);
  statements_infield.forEach(function(statement){
    if(statement[0] == '0')
      return;
    else
      for(let i = 1; i<num_of_anchors+1;i++)
        if(anchors[i]<statement[i].length)
          anchors[i] = statement[i].length;
  },this);
  for(let i = 0; i< anchors.length; i++){
    anchors[i] += anchors[i] > 0 ? 1 : 0;
  };
  return anchors;
}
function get_state_field(s_obj, regx){
  let field = '';
  let field_t = s_obj.str.match(regx);
  if(field_t){
    field = field_t[0].trim().replace(/\s{2,}/g, ' ');
    s_obj.str = s_obj.str.replace(regx, '');
  }
  return field;
}
function get_state_field_donttouch(s_obj, regx){
  let field = '';
  let field_t = s_obj.str.match(regx);
  if(field_t){
    field = field_t[0];
    s_obj.str = s_obj.str.replace(regx, '');
  }
  return field;
}
function get_max(a, b){
  return a > b ? a : b;
}
function cleanArray(actual) {
  var newArray = new Array();
  for (var i = 0; i < actual.length; i++) {
    if (actual[i]) {
      newArray.push(actual[i]);
    }
  }
  return newArray;
}