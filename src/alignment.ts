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
  let recontruct = processTxt(text);
  editor.edit((editBuilder) => {
    editBuilder.replace(range, recontruct);
  });
}

var dec = [];
var assign = [];
var left = [];
function processTxt(data){
  register_statement(data);
  let recontruct = format_declaration(dec);
  recontruct += format_assignment(assign)
  recontruct += format_left(left);
  return recontruct;
}

function register_statement(src_str){
  dec = [];
  assign = [];
  left = [];
  var assign_re = /((assign|=) *)/;
  var dtype_re = /((reg|wire|logic|integer|bit|byte|shortint|int|longint|time|shortreal|real|double|realtime)  *(signed)* *)/;
  var vector_re = /(\[[^:]*:[^:]*\])*/;
  var array_re = /(\[[^:]*:[^:]*\])+/g;
  var comment_re = /\/\/.*/;
  var rval_re = /=.*;/;
  let statements = src_str.split("\n");
  statements.forEach(function(statement) {
    if (statement.search(dtype_re) !== -1) {
      let dtype = '', vector = '', inst_name = '', array = '',  comment = '', rval = '';
      // get dtype
      let statement_obj = {str : statement};
      dtype = get_state_field(statement_obj, dtype_re);
      vector = get_state_field(statement_obj, vector_re);
      array = get_state_field(statement_obj, array_re);
      comment = get_state_field(statement_obj, comment_re);
      rval = get_state_field(statement_obj, rval_re).replace(/[\s|;]*/g,'');
      inst_name = statement_obj.str.replace(/[\s|;]*/g,'');
      dec.push({dtype:dtype, vector:vector, inst_name:inst_name, array:array, comment:comment, rval:rval});
    }
    else if(statement.search(assign_re) !== -1){
      let prefix = '', rval = '', lval = '', comment = '';
      let statement_obj = {str : statement};
      prefix = get_state_field(statement_obj, /assign/);
      comment = get_state_field(statement_obj, comment_re);
      let val = statement_obj.str.split('=');
      rval = val[1].replace(/[\s|;]*/g,'');
      lval = val[0].replace(/[\s|;]*/g,'');
      assign.push({prefix:prefix, lval:lval, rval:rval, comment:comment});
    }
    else {
      left.push(statement);
    }
  }, this);
}

function format_left(left){
  let recontruct = '';
  left.forEach(function(s) {
    recontruct += s;
  }, this);
  return recontruct;
}

function format_assignment(assigns){
  let recontruct = '';
  let p_max = 0, l_max = 0, r_max = 0;
  assigns.forEach(function(s) {
    p_max = get_max(s.prefix.length, p_max);
    l_max = get_max(s.lval.length, l_max);
    r_max = get_max(s.rval.length, r_max);
  }, this);
  assigns.forEach(function(s) {
    recontruct += `${s.prefix}${' '.repeat(p_max - s.prefix.length+1)}`;
    recontruct += `${s.lval}${' '.repeat(l_max - s.lval.length+1)}`;
    recontruct += `= `;
    recontruct += `${s.rval}${' '.repeat(r_max - s.rval.length)}`;
    recontruct += `;${s.comment}\n`;
  }, this);
  return recontruct;
}


function format_declaration(declarations){
  let recontruct = '';
  let field_pos = get_pos(declarations);
  declarations.forEach(function(s) {
    let pre_ary = '';
    pre_ary += `${s.dtype}${' '.repeat(field_pos.d_pos - s.dtype.length+1)}`;
    pre_ary += `${s.vector}${' '.repeat(field_pos.v_pos - s.vector.length+1)}`;
    pre_ary += `${s.inst_name}${' '.repeat(field_pos.i_pos - s.inst_name.length+1)}`;
    pre_ary += `${s.array}${' '.repeat(field_pos.a_pos - s.array.length+1)}`;
    pre_ary += `${s.rval}${' '.repeat(field_pos.r_pos - s.rval.length+1)};`;
    pre_ary += `${s.comment}\n`;
    recontruct += pre_ary;
  }, this)
  return recontruct;
}


function get_state_field(s_obj, regx){
  let field = '';
  let field_t = s_obj.str.match(regx);
  if(field_t){
    field = field_t[0].trim();
    s_obj.str = s_obj.str.replace(regx, '');
  }
  return field;
}



function get_pos(dec){
  let f = {
    d_pos : 0,
    i_pos : 0,
    r_pos : 0,
    v_pos : 0,
    a_pos : 0
  };
  dec.forEach(function(s){
    f.d_pos = get_max(s.dtype.length, f.d_pos);
    f.i_pos = get_max(s.inst_name.length, f.i_pos);
    f.r_pos = get_max(s.rval.length, f.r_pos);
    f.v_pos = get_max(s.vector.length, f.v_pos);
    f.a_pos = get_max(s.array.length, f.a_pos);
  }, this)
  return f;
}

function get_max(a, b){
  return a > b ? a : b;
}